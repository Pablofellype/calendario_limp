# Projeto Limpeza - Setup Local

## 1) Variaveis de ambiente
Crie/edite `.env.local` na raiz com:

- `VITE_FCM_VAPID_KEY`
- `FIREBASE_SERVICE_ACCOUNT_JSON` (JSON bruto ou base64 do service account)
- `ADMIN_EMAILS` (opcional, para `/api/notify`)
- `WEBPUSH_PUBLIC_KEY` e `WEBPUSH_PRIVATE_KEY` (se usar web push)

Referencia completa: `.env.example`.

## 2) Rodar frontend + API no mesmo comando
```bash
npm run dev
```
No modo dev, o Vite agora atende:
- `/api/now`
- `/api/notify`
- `/api/employee-login`

## 3) Definir PIN de colaboradores antigos
Se um colaborador antigo nao tiver `pinHash`, execute:
```bash
npm run set-pin -- <MATRICULA> <PIN>
```
Exemplo:
```bash
npm run set-pin -- 40145 1234
```

## 4) Regras do Firestore
As regras estao em `firestore.rules` e `firebase.json` ja aponta para esse arquivo.