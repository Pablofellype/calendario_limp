/**
 * js/reports.js
 * Arquivo exclusivo para gerar o PDF.
 */

export function generatePDF(state) {
    // 1. Verificação de segurança (Admin)
    if (!state.user || state.user.role !== 'admin') {
        window.showCustomAlert("Apenas administradores podem baixar relatórios.");
        return;
    }

    // 2. Verifica se a biblioteca foi carregada no HTML
    const { jsPDF } = window.jspdf || {};
    if (!jsPDF) {
        window.showCustomAlert("Erro: Biblioteca PDF não encontrada.");
        return;
    }

    // 3. Configuração Inicial
    const doc = new jsPDF();
    const currentMonth = state.date.getMonth();
    const currentYear = state.date.getFullYear();
    const monthName = state.date.toLocaleDateString('pt-BR', { month: 'long' }).toUpperCase();

    // 4. Filtra tarefas do mês atual
    const tasksOfMonth = state.tasks.filter(t => {
        const [y, m, d] = t.date.split('-');
        return parseInt(y) === currentYear && (parseInt(m) - 1) === currentMonth;
    }).sort((a, b) => a.date.localeCompare(b.date));

    if (tasksOfMonth.length === 0) {
        window.showCustomAlert("Nenhuma atividade neste mês.");
        return;
    }

    // 5. Cabeçalho (Fundo Vermelho)
    doc.setFillColor(244, 0, 9); 
    doc.rect(0, 0, 210, 24, 'F'); 

    doc.setTextColor(255, 255, 255);
    doc.setFontSize(14);
    doc.setFont("helvetica", "bold");
    doc.text("PORTAL ULTRA - RELATÓRIO MENSAL", 105, 15, { align: "center" });

    // 6. Informações do Relatório
    doc.setTextColor(50, 50, 50);
    doc.setFontSize(10);
    doc.setFont("helvetica", "normal");
    doc.text(`Mês de Referência: ${monthName} / ${currentYear}`, 14, 35);
    doc.text(`Gerado por: ${state.user.name || state.user.nome}`, 14, 40);
    doc.text(`Data da Emissão: ${new Date().toLocaleDateString('pt-BR')}`, 14, 45);

    // 7. Tabela de Dados
    const tableData = tasksOfMonth.map(t => {
        const [y, m, d] = t.date.split('-');
        const status = t.completed ? "CONCLUÍDO" : "PENDENTE";
        const quemFez = t.completedBy ? `\n(Feito por: ${t.completedBy})` : "";
        
        return [
            `${d}/${m}`,           // Data
            t.title,               // O que era pra fazer
            t.assignee || "---",   // Quem era o responsável
            status + quemFez       // Status final
        ];
    });

    doc.autoTable({
        startY: 50,
        head: [['DATA', 'ATIVIDADE', 'RESPONSÁVEL', 'SITUAÇÃO']],
        body: tableData,
        theme: 'striped',
        headStyles: { 
            fillColor: [60, 60, 60], 
            textColor: [255, 255, 255], 
            fontStyle: 'bold',
            halign: 'center'
        },
        styles: { 
            fontSize: 8, 
            cellPadding: 3, 
            valign: 'middle' 
        },
        columnStyles: {
            0: { cellWidth: 15, halign: 'center' }, // Data
            1: { cellWidth: 'auto' },               // Atividade
            2: { cellWidth: 50 },                   // Responsável
            3: { cellWidth: 40, halign: 'center' }  // Situação
        },
        didParseCell: function(data) {
            // Pinta o texto de Verde ou Vermelho
            if (data.section === 'body' && data.column.index === 3) {
                if (data.cell.raw.includes("CONCLUÍDO")) {
                    data.cell.styles.textColor = [0, 150, 0]; // Verde Escuro
                    data.cell.styles.fontStyle = 'bold';
                } else {
                    data.cell.styles.textColor = [200, 50, 50]; // Vermelho
                }
            }
        }
    });

    // 8. Rodapé com paginação
    const pageCount = doc.internal.getNumberOfPages();
    for(let i = 1; i <= pageCount; i++) {
        doc.setPage(i);
        doc.setFontSize(8);
        doc.setTextColor(150);
        doc.text(`Página ${i} de ${pageCount}`, 105, 290, { align: "center" });
    }

    // 9. Salva o arquivo
    doc.save(`Relatorio_Limpeza_${monthName}.pdf`);
    window.showCustomAlert("RELATÓRIO BAIXADO!", "success");
}