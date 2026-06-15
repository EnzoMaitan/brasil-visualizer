// Static, real metadata for Brazil's 27 federative units (UFs).
// Keyed by IBGE 2-digit code (matches the GeoJSON `code` property).
// region ids match the GeoJSON `regiao` field: 1 Sul, 2 Sudeste, 3 Norte, 4 Nordeste, 5 Centro-Oeste.
import type { StateMeta } from "./types";

export const BR_STATES_META: Record<string, StateMeta> = {
  "11": { sigla: "RO", name: "Rondônia", capital: "Porto Velho", region: 3, area_km2: 237765 },
  "12": { sigla: "AC", name: "Acre", capital: "Rio Branco", region: 3, area_km2: 164124 },
  "13": { sigla: "AM", name: "Amazonas", capital: "Manaus", region: 3, area_km2: 1559168 },
  "14": { sigla: "RR", name: "Roraima", capital: "Boa Vista", region: 3, area_km2: 224301 },
  "15": { sigla: "PA", name: "Pará", capital: "Belém", region: 3, area_km2: 1245870 },
  "16": { sigla: "AP", name: "Amapá", capital: "Macapá", region: 3, area_km2: 142470 },
  "17": { sigla: "TO", name: "Tocantins", capital: "Palmas", region: 3, area_km2: 277621 },
  "21": { sigla: "MA", name: "Maranhão", capital: "São Luís", region: 4, area_km2: 331937 },
  "22": { sigla: "PI", name: "Piauí", capital: "Teresina", region: 4, area_km2: 251578 },
  "23": { sigla: "CE", name: "Ceará", capital: "Fortaleza", region: 4, area_km2: 148921 },
  "24": { sigla: "RN", name: "Rio Grande do Norte", capital: "Natal", region: 4, area_km2: 52797 },
  "25": { sigla: "PB", name: "Paraíba", capital: "João Pessoa", region: 4, area_km2: 56585 },
  "26": { sigla: "PE", name: "Pernambuco", capital: "Recife", region: 4, area_km2: 98150 },
  "27": { sigla: "AL", name: "Alagoas", capital: "Maceió", region: 4, area_km2: 27848 },
  "28": { sigla: "SE", name: "Sergipe", capital: "Aracaju", region: 4, area_km2: 21925 },
  "29": { sigla: "BA", name: "Bahia", capital: "Salvador", region: 4, area_km2: 564733 },
  "31": { sigla: "MG", name: "Minas Gerais", capital: "Belo Horizonte", region: 2, area_km2: 586521 },
  "32": { sigla: "ES", name: "Espírito Santo", capital: "Vitória", region: 2, area_km2: 46074 },
  "33": { sigla: "RJ", name: "Rio de Janeiro", capital: "Rio de Janeiro", region: 2, area_km2: 43750 },
  "35": { sigla: "SP", name: "São Paulo", capital: "São Paulo", region: 2, area_km2: 248209 },
  "41": { sigla: "PR", name: "Paraná", capital: "Curitiba", region: 1, area_km2: 199298 },
  "42": { sigla: "SC", name: "Santa Catarina", capital: "Florianópolis", region: 1, area_km2: 95730 },
  "43": { sigla: "RS", name: "Rio Grande do Sul", capital: "Porto Alegre", region: 1, area_km2: 281707 },
  "50": { sigla: "MS", name: "Mato Grosso do Sul", capital: "Campo Grande", region: 5, area_km2: 357145 },
  "51": { sigla: "MT", name: "Mato Grosso", capital: "Cuiabá", region: 5, area_km2: 903207 },
  "52": { sigla: "GO", name: "Goiás", capital: "Goiânia", region: 5, area_km2: 340112 },
  "53": { sigla: "DF", name: "Distrito Federal", capital: "Brasília", region: 5, area_km2: 5760 },
};
