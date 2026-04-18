# Identidade Visual - Avalia AI

Guia completo para replicar a identidade visual do projeto Avalia AI em outros projetos.

---

## Fontes

### Google Fonts (CDN)
Adicione no `<head>` do HTML ou no CSS:

```html
<link href="https://fonts.googleapis.com/css2?family=Barlow:wght@400;500;600;700;800;900&family=Archivo+Black&display=swap" rel="stylesheet">
```

Ou via CSS:
```css
@import url("https://fonts.googleapis.com/css2?family=Barlow:wght@400;500;600;700;800;900&family=Archivo+Black&display=swap");
```

### Uso das Fontes

| Fonte | Uso | Pesos |
|-------|-----|-------|
| **Barlow** | Corpo de texto, labels, botoes, UI geral | 400 (Regular), 500 (Medium), 600 (SemiBold), 700 (Bold), 800 (ExtraBold), 900 (Black) |
| **Archivo Black** | Titulos display, headings grandes | 900 (Black) |

### Font Stacks
```css
/* Texto geral */
font-family: "Barlow", "Segoe UI", "Tahoma", sans-serif;

/* Titulos display */
font-family: "Archivo Black", "Barlow", sans-serif;
```

---

## Paleta de Cores

### Cores Primarias (Brand)
| Nome | Hex | Uso |
|------|-----|-----|
| Brand Red | `#e41e26` | Cor principal da marca, CTAs, acentos |
| Brand Red Dark | `#c61a21` | Hover de botoes, estados pressed |
| Red Alt | `#dc2626` | Sombras e glows vermelhos |

### Cores Neutras
| Nome | Hex | Uso |
|------|-----|-----|
| Ink 900 | `#151515` | Texto principal, headings |
| Ink Alt | `#1c1c1c` | Texto secundario escuro |
| Surface | `#ffffff` | Fundo de cards e paineis |
| Surface Alt | `#fafafa` | Fundo alternativo |
| Background | `#fcfcfc` | Fundo geral da aplicacao |
| Line | `#e5e7eb` | Bordas, divisores |
| Gray 500 | `#6b7280` | Texto de apoio (eyebrows) |
| Gray 400 | `#94a3b8` | Texto desabilitado |
| Gray 300 | `#cbd5e1` | Scrollbar |
| Skeleton | `#f1f3f5` | Loading states |

### Cores Semanticas
| Nome | Hex | Uso |
|------|-----|-----|
| Success | `#22c55e` | Sucesso, online, completo |
| Success Dark | `#15803d` / `#137147` | Texto verde escuro |
| Success Alt | `#10b981` | Indicadores positivos |
| Warning | `#f59e0b` | Alertas, atencao |
| Warning Dark | `#b45309` | Texto de alerta |
| Warning Alt | `#f2bf10` | Badges de aviso |
| Error | `#ef4444` | Erros, falhas |
| Error Dark | `#b91c1c` | Texto de erro |
| Error Light | `#fecaca` | Bordas de erro |
| Error Bg | `#fef2f2` | Fundo de estado de erro |

---

## Espacamento e Border Radius

### Border Radius
| Uso | Valor |
|-----|-------|
| Cards / Paineis | `14px` |
| Tiles / Cards menores | `12px` |
| Header actions | `14px` |
| Botoes pequenos | `8px` - `10px` |
| Pills / Badges | `9999px` (full round) |

### Sombras (Box Shadow)
```css
/* Card padrao */
box-shadow: 0 10px 30px rgba(15, 23, 42, 0.08);

/* Card hover */
box-shadow: 0 14px 28px rgba(15, 23, 42, 0.1);

/* Card com destaque vermelho */
box-shadow: 0 8px 20px rgba(216, 25, 32, 0.12);

/* Logo hover */
box-shadow: 0 8px 22px -8px rgba(228, 30, 38, 0.22);

/* Modal */
box-shadow: 0 28px 64px rgba(15, 23, 42, 0.18);

/* Botao ativo */
box-shadow: 0 18px 34px rgba(15, 23, 42, 0.18);

/* Erro */
box-shadow: 0 12px 32px -10px rgba(239, 68, 68, 0.18);
```

---

## Efeitos Visuais

### Glassmorphism (Header)
```css
background: rgba(255, 255, 255, 0.78);
backdrop-filter: saturate(180%) blur(24px);
-webkit-backdrop-filter: saturate(180%) blur(24px);
border-bottom: 1px solid rgba(15, 23, 42, 0.06);
```

### Grid de Fundo (Dot Pattern)
```css
background-image:
  radial-gradient(circle at 1px 1px, rgba(15, 23, 42, 0.06) 1px, transparent 0);
background-size: 28px 28px;
mask-image: radial-gradient(ellipse 80% 70% at 50% 50%, #000 30%, transparent 80%);
```

### Grid Quadriculado
```css
background-image:
  linear-gradient(to right, #e2e8f0 1px, transparent 1px),
  linear-gradient(to bottom, #e2e8f0 1px, transparent 1px);
background-size: 40px 40px;
```

---

## Sistema de Animacoes

### Timing
| Token | Valor | Uso |
|-------|-------|-----|
| `--motion-fast` | `180ms` | Micro-interacoes, hover |
| `--motion-base` | `260ms` | Transicoes padrao |
| `--motion-slow` | `360ms` | Entradas de tela |

### Easing Functions
| Token | Valor | Uso |
|-------|-------|-----|
| `--motion-ease-out` | `cubic-bezier(.22, .78, .24, 1)` | Entradas, responsivo |
| `--motion-ease-in` | `cubic-bezier(.4, 0, .2, 1)` | Saidas |
| `--motion-ease-snap` | `cubic-bezier(.2, 1, .36, 1)` | Pop, selecao |

---

## Dependencias de Estilo

```json
{
  "devDependencies": {
    "@tailwindcss/postcss": "^4.2.1",
    "autoprefixer": "^10.4.27",
    "postcss": "^8.5.8",
    "tailwindcss": "^4.2.1"
  }
}
```

### PostCSS Config (`postcss.config.js`)
```js
export default {
  plugins: {
    '@tailwindcss/postcss': {},
  },
};
```

---

## Icones

O projeto usa **Lucide React** para icones:
```json
{
  "dependencies": {
    "lucide-react": "^0.577.0"
  }
}
```

Uso:
```jsx
import { ChevronRight, Star, Check } from "lucide-react";
```

---

## Como Usar

1. Copie `design-tokens.css` para o `src/` do novo projeto
2. Importe no CSS principal: `@import "./design-tokens.css";`
3. Copie `global-styles.css` para estilos de componentes reutilizaveis
4. Instale as dependencias de estilo listadas acima
5. Adicione as fontes Google no HTML ou CSS
6. Use as classes CSS e variaveis documentadas

---

## Arquivos Incluidos

| Arquivo | Descricao |
|---------|-----------|
| `design-tokens.css` | Variaveis CSS (cores, fontes, espacamento, animacoes) |
| `global-styles.css` | CSS completo original do projeto (todos os componentes) |
| `postcss.config.js` | Configuracao PostCSS para Tailwind |
| `README.md` | Este guia |
