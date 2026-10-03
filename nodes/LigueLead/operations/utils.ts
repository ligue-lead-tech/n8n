import type { IExecuteFunctions } from 'n8n-workflow';
import { NodeOperationError } from 'n8n-workflow';

export async function getBaseUrl(ctx: IExecuteFunctions): Promise<string> {
	const credentials = await ctx.getCredentials('llApi');
	return (credentials.baseUrl as string).replace(/\/$/, '');
}

// Shared rules for the optional per-send webhook_url accepted by /sms, /voice and /rcs
export function validateWebhookUrl(
	ctx: IExecuteFunctions,
	itemIndex: number,
	value: string,
): string {
	const url = value.trim();
	const fail = (reason: string): never => {
		throw new NodeOperationError(ctx.getNode(), `"Webhook URL" inválida: ${reason}`, {
			itemIndex,
			description:
				'A URL precisa usar http ou https, ter um domínio público (sem "_"), não ser um endereço privado e ter no máximo 512 caracteres.',
		});
	};

	if (url.length > 512) fail(`tem ${url.length} caracteres (máximo 512)`);

	const scheme = /^([a-z][a-z0-9+.-]*):\/\//i.exec(url)?.[1]?.toLowerCase();
	if (!scheme) return fail(`"${url}" não é uma URL válida`);
	if (scheme !== 'http' && scheme !== 'https') {
		fail(`o protocolo "${scheme}" não é aceito, use http ou https`);
	}
	const hostMatch = /^[a-z]+:\/\/(?:[^@/?#]*@)?(\[[^\]]*\]|[^/?#:]+)(?::\d+)?(?:[/?#]|$)/i.exec(
		url,
	);
	if (!hostMatch) return fail(`"${url}" não é uma URL válida`);
	const host = hostMatch[1].toLowerCase();
	if (host.includes('_')) fail(`o domínio "${host}" contém "_"`);
	if (
		host === 'localhost' ||
		host.endsWith('.local') ||
		host.endsWith('.internal') ||
		!host.includes('.') ||
		/^(10\.|127\.|0\.|169\.254\.|192\.168\.|172\.(1[6-9]|2\d|3[01])\.)/.test(host) ||
		host.startsWith('[')
	) {
		fail(`"${host}" é um endereço privado ou reservado`);
	}
	return url;
}
