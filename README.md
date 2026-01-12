# LigueLead – n8n Custom Node

Node customizado do **n8n** para integração com a **API da LigueLead**, permitindo o envio de **SMS**, **ligações com áudio pré-existente**.

Este node foi projetado com foco em **extensibilidade**, **manutenção simples** e **organização**, permitindo adicionar novas ações sem alterar o core do node.

---

## 📌 Funcionalidades

Atualmente o node suporta:

- 📩 Envio de **SMS**
- 📞 Envio de **ligações** usando um `voice_upload_id`

---

## 🧱 Estrutura do Projeto

```
nodes/
 └── LlSend/
     ├── LlSend.node.ts
     └── operations/
         ├── index.ts
         ├── types.ts
         ├── utils.ts
         ├── sendSms.operation.ts
         ├── sendVoice.operation.ts
```

---

## 🔐 Credenciais (LigueLead API)

| Campo     | Descrição                       |
| --------- | ------------------------------- |
| Base URL  | https://api.liguelead.com.br/v1 |
| API Token | Token de autenticação           |
| App ID    | Identificador da aplicação      |

Headers enviados automaticamente:

```
api-token: <API_TOKEN>
app-id: <APP_ID>
```

---

## ⚙️ Como utilizar

1. Crie a credencial **LigueLead API**
2. Arraste o node **LigueLead** para o workflow
3. Escolha a operação desejada

---

## 🧩 Operações

### 📩 Enviar SMS (sendSms)

Exemplo de input:

```
{
  "phones": ["5511999999999"],
  "message": "Olá!"
}
```

---

### 📞 Enviar Ligação (sendVoice)

Campos obrigatórios:

- phones: string[]
- voice_upload_id: number
- title: string

Exemplo:

```
{
  "title": "Campanha Julho",
  "voice_upload_id": 123,
  "phones": ["5511999999999"]
}
```

---

## ➕ Adicionando novas operações

1. Crie um novo arquivo em `operations/`
2. Exporte um `OperationDef`
3. Registre no array `operations` em `operations/index.ts`

A nova operação aparecerá automaticamente no dropdown.

---
