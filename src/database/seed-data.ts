export interface SubcategorySeed {
  name: string;
  description: string;
}

export interface CategorySeed {
  name: string;
  description: string;
  subcategories: SubcategorySeed[];
}

export const CATEGORY_TAXONOMY: CategorySeed[] = [
  {
    name: 'Moradia',
    description: 'Despesas relacionadas à casa e moradia.',
    subcategories: [
      { name: 'Aluguel', description: 'Pagamento mensal de aluguel do imóvel.' },
      { name: 'Condomínio', description: 'Taxa de condomínio do imóvel.' },
      { name: 'Energia Elétrica', description: 'Conta de luz.' },
      { name: 'Água', description: 'Conta de água e saneamento.' },
    ],
  },
  {
    name: 'Alimentação',
    description: 'Despesas com alimentação e supermercado.',
    subcategories: [
      { name: 'Supermercado', description: 'Compras de mantimentos e produtos para casa.' },
      { name: 'Restaurante', description: 'Refeições fora de casa, delivery e restaurantes.' },
      { name: 'Padaria', description: 'Compras em padarias e conveniências.' },
    ],
  },
  {
    name: 'Transporte',
    description: 'Despesas com deslocamento e veículos.',
    subcategories: [
      { name: 'Combustível', description: 'Abastecimento de veículo.' },
      { name: 'Transporte Público', description: 'Ônibus, metrô, trem e afins.' },
      { name: 'Aplicativo de Transporte', description: 'Uber, 99 e serviços similares.' },
      { name: 'Manutenção Veicular', description: 'Manutenção e reparos do veículo.' },
    ],
  },
  {
    name: 'Saúde',
    description: 'Despesas com saúde e bem-estar.',
    subcategories: [
      { name: 'Plano de Saúde', description: 'Mensalidade do plano de saúde.' },
      { name: 'Farmácia', description: 'Medicamentos e produtos farmacêuticos.' },
      { name: 'Consultas Médicas', description: 'Consultas e exames médicos.' },
    ],
  },
  {
    name: 'Educação',
    description: 'Despesas com educação e desenvolvimento.',
    subcategories: [
      { name: 'Mensalidade Escolar', description: 'Mensalidade de escola, faculdade ou curso.' },
      { name: 'Material Didático', description: 'Livros, apostilas e materiais escolares.' },
      { name: 'Cursos e Certificações', description: 'Cursos livres, certificações e treinamentos.' },
    ],
  },
  {
    name: 'Lazer',
    description: 'Despesas com entretenimento e lazer.',
    subcategories: [
      { name: 'Streaming', description: 'Assinaturas de streaming de vídeo e música.' },
      { name: 'Cinema e Shows', description: 'Ingressos para cinema, shows e eventos.' },
      { name: 'Viagens', description: 'Despesas com viagens e passeios.' },
    ],
  },
  {
    name: 'Renda',
    description: 'Entradas de recursos financeiros.',
    subcategories: [
      { name: 'Salário', description: 'Remuneração mensal do trabalho.' },
      { name: 'Freelance', description: 'Renda extra de trabalhos autônomos.' },
      { name: 'Investimentos', description: 'Rendimentos de aplicações financeiras.' },
    ],
  },
  {
    name: 'Outros',
    description: 'Despesas diversas não classificadas nas demais categorias.',
    subcategories: [
      { name: 'Diversos', description: 'Gastos variados sem categoria específica.' },
      { name: 'Presentes', description: 'Compra de presentes.' },
      { name: 'Doações', description: 'Doações e contribuições.' },
    ],
  },
];
