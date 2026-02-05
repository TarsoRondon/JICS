import { calcularRanking } from './sorteio.service.js';
import { buscarJogosFinalizados } from './jogos.service.js';

export async function obterRanking({ organization_id, evento_id, modalidade_id, sexo }) {
  const jogos = await buscarJogosFinalizados({ organization_id, evento_id, modalidade_id, sexo });
  return calcularRanking(jogos);
}

