# Sistema de Levantamento em Campo — Implementação completa

## Contexto

Hoje existe um botão "+ Novo" no app mobile que abre o formulário de cadastro padrão de serviços. Precisamos adicionar um NOVO fluxo paralelo: a própria equipe de campo poderá levantar um serviço ao identificar a necessidade de manutenção preventiva em campo, anexando fotos. Esse levantamento entra como pendente de aprovação do despachante no painel web. Se aprovado, vira um serviço oficial na tabela `servicos`, já atribuído à matrícula que fez o levantamento, entrando direto com status `cadastrado` para a equipe poder executar.

## 1. Banco de dados — nova tabela `levantamentos`

Criar no Supabase via SQL Editor: (Já executei manualmente, já está criado no supabase desta forma.)

```sql
CREATE TABLE levantamentos (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  data_hora timestamp with time zone NOT NULL DEFAULT now(),
  equip text,
  local text NOT NULL,
  tipo text NOT NULL CHECK (tipo IN ('NSIS', 'NSCP', 'RC02', 'INBE')),
  tecnico_origem text NOT NULL,
  matricula_autor text,
  descricao text NOT NULL,
  observacao text,
  recurso_necessario text,
  fotos text[] DEFAULT '{}',
  status text NOT NULL DEFAULT 'pendente' CHECK (status IN ('pendente', 'aprovado', 'reprovado')),
  motivo_reprovacao text,
  aprovado_por jsonb,
  dt_aprovacao timestamp with time zone,
  servico_gerado_id text,
  criado_em timestamp with time zone NOT NULL DEFAULT now()
);

-- Storage bucket para as fotos (se ainda não existir um genérico)
-- Criar bucket 'levantamentos' no Supabase Storage, público para leitura.
```

Campos do formulário mobile mapeados:
- Data e hora → `data_hora` (preenchido automaticamente pelo app no momento do envio, mas exibível/editável)
- Equip/Trafo → `equip` (texto, aceita apenas números e "-")
- Localidade → `local` (mesma lista de localidades/postos já usada no CadastroForm)
- Tipo de serviço → `tipo` (enum: NSIS, NSCP, RC02, INBE)
- Técnico de origem (Equipe) → `tecnico_origem` (texto livre)
- Descrição da solicitação → `descricao` (obrigatório)
- Observação → `observacao` (opcional)
- Recurso necessário → `recurso_necessario` (opcional)
- Fotos → `fotos` (array de até 3 URLs do Supabase Storage)

## 2. App mobile — novo formulário de levantamento

Adicionar uma opção dentro do botão "+ Novo" existente (ou um botão irmão) chamada "Levantamento de campo", abrindo um formulário com os campos acima na ordem listada. Validação:
- Campos obrigatórios: Data/hora, Localidade, Tipo de serviço, Técnico de origem, Descrição, ao menos 1 foto.
- Campos opcionais: Equip/Trafo, Observação, Recurso necessário (até 3 fotos no total).
- Localidade deve reutilizar o mesmo componente de busca/seleção de localidade já usado no CadastroForm (mesma lista de postos).
- Ao enviar, faz upload das fotos para o bucket `levantamentos` no Supabase Storage e grava o registro na tabela `levantamentos` com `status: 'pendente'` e `matricula_autor` da sessão logada.
- Exibir para o usuário do app uma tela/lista de "Meus levantamentos" mostrando os enviados e seus status (pendente / aprovado / reprovado), similar à listagem de serviços já existente.

## 3. Painel web — nova aba "Levantamentos"

Criar um novo componente `LevantamentosTab.jsx`, seguindo o mesmo padrão visual e estrutural do `EspacadoresTab.jsx` (cards, paginação, tabela, popup de detalhes). Estrutura de abas internas:

- **Aguardando aprovação** — `status = 'pendente'`
- **Aprovados** — `status = 'aprovado'`
- **Reprovados** — `status = 'reprovado'`

Cada card/linha na aba "Aguardando aprovação" mostra: ID temporário (gerado pelo `uuid`, ou exibir só os 8 primeiros caracteres), localidade, tipo, técnico de origem, descrição resumida, miniaturas das até 3 fotos, e botão "Revisar" que abre um modal (reaproveitar estrutura do `AprovacaoModal` do `EspacadoresTab`) mostrando todos os campos e fotos em tamanho ampliável.

No modal de revisão, dois botões: **Aprovar** e **Reprovar** (motivo obrigatório, igual ao padrão já usado em `ReprovadoPopup`).

## 4. Lógica de aprovação — gera serviço automaticamente

Ao clicar em **Aprovar**:

1. Gera um novo `id` sequencial para a tabela `servicos`, seguindo o mesmo padrão usado no cadastro manual hoje (ex: prefixo de localidade + número sequencial, como `VD0456`).
2. Insere um novo registro em `servicos` com:
   - `id`: novo ID gerado
   - `local`: copiado do levantamento
   - `tipo`: copiado do levantamento
   - `desc`: copiado de `descricao` do levantamento
   - `equip`: copiado do levantamento
   - `status`: `'cadastrado'`
   - `obs`: copiado de `observacao` do levantamento (se houver)
   - `orig`: copiado de `tecnico_origem`
   - `data`: timestamp atual
   - `dtCadastro`: timestamp atual
   - `autor`: nome do despachante que aprovou
   - `matriculaAutor`: matrícula do despachante que aprovou
   - `atribuido_para`: objeto jsonb contendo a matrícula e nome de quem fez o levantamento original (`matricula_autor` do levantamento) — isso garante que o serviço já nasce atribuído à equipe que levantou
   - `dt_atribuicao`: timestamp atual
   - `hist`: array iniciado com uma entrada `{ who: despachante, matricula: despachante, when: timestamp, msg: 'Serviço gerado a partir de levantamento de campo aprovado.' }`
3. Atualiza o registro em `levantamentos`:
   - `status: 'aprovado'`
   - `aprovado_por`: `{ nome, matricula }` do despachante
   - `dt_aprovacao`: timestamp atual
   - `servico_gerado_id`: o novo `id` criado em `servicos`

Ao clicar em **Reprovar**:
- Atualiza `levantamentos` com `status: 'reprovado'`, `motivo_reprovacao` preenchido, `aprovado_por` e `dt_aprovacao` também preenchidos (para rastrear quem reprovou e quando).
- Não gera nenhum registro em `servicos`.
- O app mobile deve refletir esse status na tela "Meus levantamentos" da equipe, mostrando o motivo da reprovação.

## 5. Padrões técnicos a seguir (importante)

- Usar Supabase em todas as operações (`supabase.from(...).select/update/insert`), NÃO usar Firebase — o projeto já migrou para Supabase em outras telas.
- Nomes de colunas devem ser criados consistentes (preferencialmente `snake_case`, já que colunas camelCase têm causado bugs de schema cache no projeto — ver colunas como `motivo_reprovacao` já usada dessa forma na tabela `servicos`).
- Reaproveitar componentes visuais já existentes (`POPUP_OVERLAY`, `POPUP_BOX`, `BTN_PRIMARY`, `BTN_CANCEL`, `inputStyle`, `MultiSelect`, `Paginacao`) ao invés de recriar do zero, mantendo consistência visual com `ServicosTable.jsx` e `EspacadoresTab.jsx`.
- Usar realtime subscription do Supabase (`postgres_changes`) para a lista de levantamentos atualizar ao vivo no painel web, no mesmo padrão já usado no `EspacadoresTab`.
- Adicionar a nova aba "Levantamentos" no menu de navegação principal do app web, com badge de contagem mostrando quantos estão com `status = 'pendente'`, no mesmo estilo visual das abas já existentes.