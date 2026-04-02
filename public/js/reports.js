import { jsPDF } from 'jspdf';
import autoTable from 'jspdf-autotable';

export function generatePDF(state) {
    if (!state.user || state.user.role !== 'admin') {
        window.showCustomAlert('Apenas administradores podem baixar relatorios.');
        return;
    }

    const doc = new jsPDF();
    const currentMonth = state.date.getMonth();
    const currentYear = state.date.getFullYear();
    const monthName = state.date.toLocaleDateString('pt-BR', { month: 'long' }).toUpperCase();

    const tasksOfMonth = state.tasks.filter(t => {
        const [y, m] = t.date.split('-');
        return parseInt(y) === currentYear && (parseInt(m) - 1) === currentMonth;
    }).sort((a, b) => a.date.localeCompare(b.date));

    if (tasksOfMonth.length === 0) {
        window.showCustomAlert('Nenhuma atividade neste mes.');
        return;
    }

    doc.setFillColor(244, 0, 9);
    doc.rect(0, 0, 210, 24, 'F');

    doc.setTextColor(255, 255, 255);
    doc.setFontSize(14);
    doc.setFont('helvetica', 'bold');
    doc.text('PORTAL ULTRA - RELATORIO MENSAL', 105, 15, { align: 'center' });

    doc.setTextColor(50, 50, 50);
    doc.setFontSize(10);
    doc.setFont('helvetica', 'normal');
    doc.text(`Mes de Referencia: ${monthName} / ${currentYear}`, 14, 35);
    doc.text(`Gerado por: ${state.user.name || state.user.nome}`, 14, 40);
    doc.text(`Data da Emissao: ${new Date().toLocaleDateString('pt-BR')}`, 14, 45);

    const tableData = tasksOfMonth.map(t => {
        const [, m, d] = t.date.split('-');
        const status = t.completed ? 'CONCLUIDO' : 'PENDENTE';
        const quemFez = t.completedBy ? `\n(Feito por: ${t.completedBy})` : '';

        return [
            `${d}/${m}`,
            t.title,
            t.assignee || '---',
            status + quemFez
        ];
    });

    autoTable(doc, {
        startY: 50,
        head: [['DATA', 'ATIVIDADE', 'RESPONSAVEL', 'SITUACAO']],
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
            0: { cellWidth: 15, halign: 'center' },
            1: { cellWidth: 'auto' },
            2: { cellWidth: 50 },
            3: { cellWidth: 40, halign: 'center' }
        },
        didParseCell: function(data) {
            if (data.section === 'body' && data.column.index === 3) {
                if (String(data.cell.raw).includes('CONCLUIDO')) {
                    data.cell.styles.textColor = [0, 150, 0];
                    data.cell.styles.fontStyle = 'bold';
                } else {
                    data.cell.styles.textColor = [200, 50, 50];
                }
            }
        }
    });

    const pageCount = doc.internal.getNumberOfPages();
    for (let i = 1; i <= pageCount; i++) {
        doc.setPage(i);
        doc.setFontSize(8);
        doc.setTextColor(150);
        doc.text(`Pagina ${i} de ${pageCount}`, 105, 290, { align: 'center' });
    }

    doc.save(`Relatorio_Limpeza_${monthName}.pdf`);
    window.showCustomAlert('RELATORIO BAIXADO!', 'success');
}