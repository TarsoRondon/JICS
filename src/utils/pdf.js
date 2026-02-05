import path from 'path';
import PdfPrinter from 'pdfmake';

const fonts = {
  Roboto: {
    normal: path.join(process.cwd(), 'node_modules/pdfmake/fonts/Roboto-Regular.ttf'),
    bold: path.join(process.cwd(), 'node_modules/pdfmake/fonts/Roboto-Medium.ttf'),
    italics: path.join(process.cwd(), 'node_modules/pdfmake/fonts/Roboto-Italic.ttf'),
    bolditalics: path.join(process.cwd(), 'node_modules/pdfmake/fonts/Roboto-MediumItalic.ttf'),
  },
};

const printer = new PdfPrinter(fonts);

function buildTabelaRanking(chave, linhas) {
  return [
    { text: chave, style: 'chaveTitle', margin: [0, 12, 0, 6] },
    {
      table: {
        headerRows: 1,
        widths: ['*', 'auto', 'auto', 'auto', 'auto', 'auto'],
        body: [
          ['Equipe', 'P', 'V', 'E', 'D', 'Saldo'],
          ...linhas.map((l) => [
            l.equipe,
            l.pontos,
            l.vitorias,
            l.empates,
            l.derrotas,
            l.saldo,
          ]),
        ],
      },
      layout: 'lightHorizontalLines',
    },
  ];
}

export async function gerarPdfSorteio({ evento, modalidade, sexo, rankingPorChave }) {
  const hoje = new Date().toLocaleDateString('pt-BR');
  const content = [
    {
      columns: [
        { text: 'IFRO', style: 'logo' },
        {
          stack: [
            { text: 'JICS - IFRO Esportes', style: 'title' },
            { text: `Evento: ${evento?.nome || 'N/A'} (${evento?.ano || ''})`, style: 'subtitle' },
            { text: `Modalidade: ${modalidade?.titulo || 'N/A'} | Sexo: ${sexo}`, style: 'subtitle' },
            { text: `Data: ${hoje}`, style: 'subtitle' },
          ],
          alignment: 'right',
        },
      ],
    },
  ];

  Object.keys(rankingPorChave).forEach((chave) => {
    content.push(...buildTabelaRanking(chave, rankingPorChave[chave]));
  });

  const docDefinition = {
    content,
    styles: {
      logo: { fontSize: 22, bold: true, color: '#0a7f6f' },
      title: { fontSize: 16, bold: true },
      subtitle: { fontSize: 10, color: '#4b5563' },
      chaveTitle: { fontSize: 12, bold: true, color: '#111827' },
    },
    defaultStyle: {
      font: 'Roboto',
    },
  };

  return new Promise((resolve, reject) => {
    const pdfDoc = printer.createPdfKitDocument(docDefinition);
    const chunks = [];
    pdfDoc.on('data', (chunk) => chunks.push(chunk));
    pdfDoc.on('end', () => resolve(Buffer.concat(chunks)));
    pdfDoc.on('error', reject);
    pdfDoc.end();
  });
}

