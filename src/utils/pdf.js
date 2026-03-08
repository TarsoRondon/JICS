import path from 'path';
import fs from 'fs';
import PdfPrinter from 'pdfmake';

function pickFirstExisting(paths = []) {
  return paths.find((p) => fs.existsSync(p));
}

function resolvePdfFonts() {
  // pdfmake pode variar a distribuição de fontes entre versões.
  const normal = pickFirstExisting([
    path.join(process.cwd(), 'node_modules/pdfmake/fonts/Roboto-Regular.ttf'),
  ]);
  const bold = pickFirstExisting([
    path.join(process.cwd(), 'node_modules/pdfmake/fonts/Roboto-Medium.ttf'),
  ]);
  const italics = pickFirstExisting([
    path.join(process.cwd(), 'node_modules/pdfmake/fonts/Roboto-Italic.ttf'),
  ]);
  const bolditalics = pickFirstExisting([
    path.join(process.cwd(), 'node_modules/pdfmake/fonts/Roboto-MediumItalic.ttf'),
  ]);

  if (normal && bold && italics && bolditalics) {
    return {
      defaultFont: 'Roboto',
      fonts: {
        Roboto: {
          normal,
          bold,
          italics,
          bolditalics,
        },
      },
    };
  }

  // Fallback robusto sem leitura de arquivos externos.
  return {
    defaultFont: 'Helvetica',
    fonts: {
      Helvetica: {
        normal: 'Helvetica',
        bold: 'Helvetica-Bold',
        italics: 'Helvetica-Oblique',
        bolditalics: 'Helvetica-BoldOblique',
      },
    },
  };
}

const { defaultFont, fonts } = resolvePdfFonts();
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
      font: defaultFont,
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

function normalizeStatusTabela(status) {
  const raw = String(status || '').toUpperCase();
  if (raw === 'DONE' || raw === 'FINALIZADO' || raw === 'ENCERRADO') return 'Finalizado';
  if (raw === 'EM_ANDAMENTO' || raw === 'LIVE') return 'Em andamento';
  return 'Agendado';
}

export async function gerarPdfTabelaSorteio({ evento, modalidade, sexo, jogos = [] }) {
  const hoje = new Date().toLocaleDateString('pt-BR');
  const linhas = (Array.isArray(jogos) ? jogos : []).map((j, idx) => ([
    j?.ordem ?? (idx + 1),
    j?.numero_jogo != null ? `Jogo ${j.numero_jogo}` : `Jogo ${idx + 1}`,
    j?.hora_oficial || j?.hora_texto || 'A seguir',
    j?.chave || '-',
    j?.equipe_a || '-',
    j?.equipe_b || '-',
    normalizeStatusTabela(j?.status),
  ]));

  const content = [
    {
      columns: [
        { text: 'IFRO', style: 'logo' },
        {
          stack: [
            { text: 'Tabela de Sorteio', style: 'title' },
            { text: `Evento: ${evento?.nome || 'N/A'}${evento?.ano ? ` (${evento.ano})` : ''}`, style: 'subtitle' },
            { text: `Modalidade: ${modalidade?.titulo || 'N/A'} | Sexo: ${sexo || 'N/A'}`, style: 'subtitle' },
            { text: `Gerado em: ${hoje}`, style: 'subtitle' },
          ],
          alignment: 'right',
        },
      ],
    },
    { text: ' ' },
    {
      table: {
        headerRows: 1,
        widths: [36, 58, 52, 44, '*', '*', 70],
        body: [
          ['Ord', 'Jogo', 'Hora', 'Ch', 'Equipe A', 'Equipe B', 'Status'],
          ...linhas,
        ],
      },
      layout: 'lightHorizontalLines',
    },
  ];

  if (!linhas.length) {
    content.push({
      margin: [0, 10, 0, 0],
      text: 'Nenhum jogo salvo para os filtros selecionados.',
      color: '#6b7280',
    });
  }

  const docDefinition = {
    content,
    styles: {
      logo: { fontSize: 22, bold: true, color: '#0a7f6f' },
      title: { fontSize: 16, bold: true },
      subtitle: { fontSize: 10, color: '#4b5563' },
    },
    defaultStyle: {
      font: defaultFont,
      fontSize: 9,
    },
    pageOrientation: 'landscape',
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
