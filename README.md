# LigueLead – n8n Custom Node

Custom **n8n** node for integration with the **LigueLead API**, allowing the sending of **SMS messages** and **voice calls using pre-uploaded audio**.

This node was designed with a strong focus on **extensibility**, **easy maintenance**, and **clean architecture**, making it simple to add new actions without modifying the core node logic.

---

## 📌 Features

Currently, the node supports:

- 📩 **SMS sending**
- 📞 **Voice calls** using a `voice_upload_id`

---

## 🔐 Credentials (LigueLead API)

| Field     | Description                     |
| --------- | ------------------------------- |
| Base URL  | https://api.liguelead.com.br/v1 |
| API Token | Authentication token            |
| App ID    | Application identifier          |

Headers sent automatically:

```
api-token: <API_TOKEN>
app-id: <APP_ID>
```

---

## ⚙️ How to Use

1. Create the **LigueLead API** credential
2. Drag the **LigueLead** node into your workflow
3. Select the desired operation

---

## 🧩 Operations

### 📩 Send SMS (sendSms)

Required fields:

- phones: string[]
- message: string
- title: string

Optional field:

- isFlash: boolean (SMS type)

Example:

```json
{
	"phones": ["5511999999999"],
	"message": "Hello!",
	"title": "Test"
}
```

---

### 📞 Send Voice Call (sendVoice)

Required fields:

- phones: string[]
- voice_upload_id: number
- title: string

Example:

```json
{
	"title": "July Campaign",
	"voice_upload_id": 123,
	"phones": ["5511999999999"]
}
```
