import type { IExecuteFunctions } from 'n8n-workflow';
import { NodeOperationError } from 'n8n-workflow';

const MAX_SIZE_BYTES = 50 * 1024 * 1024;
const AUDIO_TYPES: Record<string, string> = {
	mp3: 'audio/mpeg',
	wav: 'audio/wav',
};
const MIME_TO_EXTENSION: Record<string, string> = {
	'audio/mpeg': 'mp3',
	'audio/mp3': 'mp3',
	'audio/mpeg3': 'mp3',
	'audio/x-mpeg-3': 'mp3',
	'audio/wav': 'wav',
	'audio/x-wav': 'wav',
	'audio/wave': 'wav',
	'audio/vnd.wave': 'wav',
};

export type UploadedAudio = { id: number; title: string; response: unknown };

function fail(
	ctx: IExecuteFunctions,
	itemIndex: number,
	message: string,
	description?: string,
): never {
	throw new NodeOperationError(ctx.getNode(), message, { itemIndex, description });
}

// Uploads the item's binary file to POST /voice/uploads and returns the new audio ID
export async function uploadAudio(
	ctx: IExecuteFunctions,
	itemIndex: number,
	baseUrl: string,
	binaryPropertyName: string,
	title: string,
): Promise<UploadedAudio> {
	const propertyName = binaryPropertyName.trim() || 'data';
	const binaries = ctx.getInputData()[itemIndex]?.binary ?? {};
	const binaryData = binaries[propertyName];
	if (!binaryData) {
		const available = Object.keys(binaries);
		fail(
			ctx,
			itemIndex,
			`O item não tem arquivo no campo binário "${propertyName}"`,
			available.length
				? `Campos binários disponíveis neste item: ${available.join(', ')}. Ajuste o "Input Binary Field".`
				: 'Nenhum arquivo chegou neste item. Conecte antes um node que traga o áudio (ex.: Read/Write Files from Disk, HTTP Request, Google Drive, Form Trigger).',
		);
	}

	const fileName = binaryData.fileName ?? `audio.${binaryData.fileExtension ?? 'mp3'}`;
	const extFromName = /\.([a-z0-9]+)$/i.exec(fileName)?.[1]?.toLowerCase();
	const mime = (binaryData.mimeType ?? '').toLowerCase().split(';')[0].trim();
	const extension =
		MIME_TO_EXTENSION[mime] ??
		(extFromName && AUDIO_TYPES[extFromName] ? extFromName : undefined) ??
		(binaryData.fileExtension && AUDIO_TYPES[binaryData.fileExtension.toLowerCase()]
			? binaryData.fileExtension.toLowerCase()
			: undefined);
	if (!extension) {
		fail(
			ctx,
			itemIndex,
			`Formato de áudio não suportado: ${fileName}${mime ? ` (${mime})` : ''}`,
			'A LigueLead aceita apenas MP3 e WAV (AAC e M4A não são suportados). Converta o arquivo antes, por exemplo: ffmpeg -i entrada.m4a saida.mp3',
		);
	}

	const buffer = await ctx.helpers.getBinaryDataBuffer(itemIndex, propertyName);
	if (!buffer.length) {
		fail(ctx, itemIndex, `O arquivo "${fileName}" está vazio`);
	}
	if (buffer.length > MAX_SIZE_BYTES) {
		fail(
			ctx,
			itemIndex,
			`O arquivo "${fileName}" tem ${(buffer.length / 1024 / 1024).toFixed(1)} MB (máximo 50 MB)`,
			'Reduza o tamanho do áudio (recomendado 5–10 MB), por exemplo: ffmpeg -i entrada.wav -ar 16000 -ab 128k -ac 1 saida.mp3',
		);
	}

	const audioTitle = title.trim() || fileName.replace(/\.[^.]+$/, '');
	const safeFileName = fileName.replace(/["\r\n]/g, '_');
	const boundary = `----LigueLeadN8n${Date.now().toString(16)}${Math.random().toString(16).slice(2)}`;
	const body = Buffer.concat([
		Buffer.from(
			`--${boundary}\r\nContent-Disposition: form-data; name="title"\r\n\r\n${audioTitle}\r\n` +
				`--${boundary}\r\nContent-Disposition: form-data; name="file"; filename="${safeFileName}"\r\n` +
				`Content-Type: ${AUDIO_TYPES[extension]}\r\n\r\n`,
			'utf8',
		),
		buffer,
		Buffer.from(`\r\n--${boundary}--\r\n`, 'utf8'),
	]);

	const response = (await ctx.helpers.httpRequestWithAuthentication.call(ctx, 'llApi', {
		method: 'POST',
		url: `${baseUrl}/voice/uploads`,
		headers: { 'Content-Type': `multipart/form-data; boundary=${boundary}` },
		body,
		json: true,
	})) as { data?: { id?: number | string; title?: string } };

	const id = Number(response?.data?.id);
	if (!Number.isFinite(id) || id <= 0) {
		fail(
			ctx,
			itemIndex,
			'A LigueLead não devolveu o ID do áudio enviado',
			`Resposta recebida: ${JSON.stringify(response).slice(0, 500)}`,
		);
	}

	return { id, title: response?.data?.title ?? audioTitle, response };
}
