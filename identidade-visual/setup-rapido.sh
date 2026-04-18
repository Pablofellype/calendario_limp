#!/bin/bash
# ============================================
#  AVALIA AI — Setup Rapido de Identidade Visual
#  Execute na raiz do novo projeto
# ============================================

echo "🎨 Instalando dependencias de estilo..."
npm install -D tailwindcss@^4.2.1 @tailwindcss/postcss@^4.2.1 postcss@^8.5.8 autoprefixer@^10.4.27

echo "📦 Instalando pacote de icones..."
npm install lucide-react@^0.577.0

echo ""
echo "✅ Dependencias instaladas!"
echo ""
echo "Proximos passos:"
echo "  1. Copie 'postcss.config.js' para a raiz do projeto"
echo "  2. Copie 'design-tokens.css' para src/"
echo "  3. No seu CSS principal, adicione:"
echo '     @import "tailwindcss";'
echo '     @import "./design-tokens.css";'
echo "  4. Use as variaveis CSS: var(--brand-red), var(--font-body), etc."
echo "  5. Use as classes: .display-heading, .accent-eyebrow, etc."
echo ""
echo "📖 Consulte o README.md para detalhes completos."
