# Calendario DPA

Sistema de gestao de escalas e tarefas de limpeza para a Diretoria de Planejamento e Administracao (DPA).

<p align="center">
  <img src="https://i.postimg.cc/c4LqxjXc/capa-calendario-nova.png" alt="Logo DPA" width="180">
</p>

## Sobre

O Calendario DPA e uma aplicacao web progressiva (PWA) para organizar escalas de limpeza, gerenciar equipes de colaboradores e acompanhar a execucao de atividades diarias.

## Funcionalidades

### Gestao de Tarefas
- Calendario mensal e semanal interativo
- Criacao de tarefas com atribuicao de responsaveis
- Tarefas recorrentes (semanal, ate o final do ano)
- Drag & drop para mover tarefas entre datas
- Filtros por nome, colaborador e status (pendentes/concluidas)
- Comprovantes fotograficos obrigatorios para conclusao

### Gestao de Equipe
- Cadastro de colaboradores com foto, matricula e PIN
- Controle de acesso ativo/inativo
- Busca rapida de colaboradores

### Perfis de Acesso
- **Administrador** — Acesso total: criar tarefas, gerenciar equipe, gerar relatorios
- **Colaborador** — Visualizar e concluir tarefas atribuidas (com foto obrigatoria)
- **Visitante** — Somente visualizacao do calendario

### Relatorios
- Geracao de relatorio mensal em PDF
- Compartilhamento de escala diaria como imagem

### Notificacoes
- Push notifications para novas atribuicoes
- Notificacoes locais em tempo real

### PWA
- Instalavel como app no celular
- Interface responsiva (320px ate 4K)
- Funciona em qualquer dispositivo

## Stack Tecnologica

| Componente | Tecnologia |
|-----------|-----------|
| Frontend | Vanilla JS, Vite, Tailwind CSS |
| Backend/DB | Firebase (Firestore, Auth, Cloud Messaging) |
| Animacoes | GSAP |
| Icones | Lucide |
| PDF | jsPDF + AutoTable |
| Imagens | html2canvas |

## Instalacao

```bash
# Instalar dependencias
npm install

# Rodar em desenvolvimento
npm run dev

# Build para producao
npm run build
```

## Variaveis de Ambiente

Crie/edite `.env.local` na raiz com:

- `VITE_FCM_VAPID_KEY`
- `FIREBASE_SERVICE_ACCOUNT_JSON` (JSON bruto ou base64 do service account)
- `ADMIN_EMAILS` (opcional, para `/api/notify`)
- `WEBPUSH_PUBLIC_KEY` e `WEBPUSH_PRIVATE_KEY` (se usar web push)

Referencia completa: `.env.example`.

## API (modo dev)

No modo dev, o Vite atende:
- `/api/now`
- `/api/notify`
- `/api/employee-login`

## Definir PIN de colaboradores

```bash
npm run set-pin -- <MATRICULA> <PIN>
```

## Regras do Firestore

As regras estao em `firestore.rules` e `firebase.json` ja aponta para esse arquivo.

## Estrutura do Projeto

```
public/
  index.html            # Pagina principal
  manifest.webmanifest  # Configuracao PWA
  css/styles.css        # Estilos (Tailwind + custom)
  js/
    app.js              # Entry point
    vendor.js           # Dependencias (GSAP, Lucide, Confetti)
    tasks.js            # Calendario, tarefas, drag & drop
    team.js             # Gestao de colaboradores
    auth-ui.js          # Autenticacao e login
    state.js            # Estado global
    permissions.js      # Controle de permissoes
    reports.js          # Geracao de PDF
    push.js             # Notificacoes push
    firebase-config.js  # Configuracao Firebase
    ui/
      alerts.js         # Sistema de alertas
      toast.js          # Notificacoes toast empilhaveis
      onboarding.js     # Tutorial interativo
```

## Licenca

Projeto interno — DPA.
