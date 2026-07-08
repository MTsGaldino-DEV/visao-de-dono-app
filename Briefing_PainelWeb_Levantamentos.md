# Painel Web — Implementação da Aba "Levantamentos"

## Contexto geral

O app mobile **Visão de Dono** (React Native / Expo) foi atualizado para permitir que técnicos de campo registrem necessidades de manutenção preventiva identificadas em campo — chamadas de **Levantamentos**. Esses registros entram no banco de dados Supabase com `status = 'pendente'` e precisam ser revisados pelo despachante no **painel web**.

Este documento descreve **exatamente o que precisa ser implementado no painel web**.

---

## 1. O que já existe no banco de dados (não criar novamente)

### Tabela `levantamentos` — já criada no Supabase

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
```

**Descrição de cada coluna:**

| Coluna | Tipo | Descrição |
|---|---|---|
| `id` | uuid | PK gerado automaticamente |
| `data_hora` | timestamptz | Data/hora do levantamento (preenchida pelo app) |
| `equip` | text | Número do equipamento/transformador (opcional) |
| `local` | text | Localidade/posto do levantamento |
| `tipo` | text | Tipo: `NSIS`, `NSCP`, `RC02` ou `INBE` |
| `tecnico_origem` | text | Nome da equipe/técnico que identificou |
| `matricula_autor` | text | Matrícula do técnico que enviou pelo app |
| `descricao` | text | Descrição do que foi identificado |
| `observacao` | text | Observações adicionais (pode ser null) |
| `recurso_necessario` | text | Recursos necessários (pode ser null) |
| `fotos` | text[] | Array com até 3 URLs públicas do Supabase Storage (bucket `levantamentos`) |
| `status` | text | `pendente`, `aprovado` ou `reprovado` |
| `motivo_reprovacao` | text | Motivo, preenchido ao reprovar (pode ser null) |
| `aprovado_por` | jsonb | `{ "nome": "...", "matricula": "..." }` do despachante que agiu |
| `dt_aprovacao` | timestamptz | Timestamp da aprovação/reprovação |
| `servico_gerado_id` | text | ID do serviço criado em `servicos` ao aprovar (ex: `VD0456`) |
| `criado_em` | timestamptz | Timestamp de criação do registro |

### Storage Bucket `levantamentos` — já criado, público para leitura

As fotos estão em URLs públicas no formato:
```
https://<projeto>.supabase.co/storage/v1/object/public/levantamentos/<uid_tecnico>/<timestamp>_foto1.jpg
```

---

## 2. O que o app mobile já faz (não reimplementar)

- O técnico preenche o formulário de levantamento no app e envia.
- O app faz upload das fotos para o bucket `levantamentos` e grava o registro na tabela `levantamentos` com `status = 'pendente'` e `matricula_autor` do técnico logado.
- O técnico tem uma tela "Meus Levantamentos" que mostra os status em tempo real — inclusive `servico_gerado_id` quando aprovado e `motivo_reprovacao` quando reprovado.

---

## 3. O que precisa ser implementado no painel web

### 3.1 Nova aba "Levantamentos" na navegação principal

- Adicionar no menu de navegação do painel web uma nova aba chamada **"Levantamentos"**.
- A aba deve ter um **badge numérico** mostrando quantos levantamentos estão com `status = 'pendente'`, no mesmo estilo visual das abas já existentes.
- Esse badge deve atualizar em tempo real via realtime subscription do Supabase (`postgres_changes` na tabela `levantamentos`).

### 3.2 Componente `LevantamentosTab.jsx`

Criar seguindo o **mesmo padrão visual e estrutural** do `EspacadoresTab.jsx` (cards, paginação, popup de detalhes). O componente terá **3 abas internas**:

| Aba | Filtro |
|---|---|
| Aguardando aprovação | `status = 'pendente'` |
| Aprovados | `status = 'aprovado'` |
| Reprovados | `status = 'reprovado'` |

#### Aba "Aguardando aprovação" — o que cada card/linha exibe:

- ID curto: primeiros 8 caracteres do UUID em maiúsculas (ex: `A3F8C21D`)
- Localidade (`local`)
- Tipo (`tipo`) — exibir como badge/chip
- Técnico de origem (`tecnico_origem`)
- Matrícula do autor (`matricula_autor`)
- Descrição resumida (`descricao`) — com truncamento
- Miniaturas das fotos (até 3) — imagens clicáveis para ampliar
- Data/hora (`criado_em`) formatada em pt-BR
- Botão **"Revisar"** que abre o modal de revisão

#### Abas "Aprovados" e "Reprovados":

- Mesmas informações, sem botão "Revisar".
- Em "Aprovados": mostrar o `servico_gerado_id` como destaque (ex: `Serviço gerado: VD0456`).
- Em "Reprovados": mostrar o `motivo_reprovacao` em destaque e quem reprovou (`aprovado_por.nome`).

### 3.3 Modal de Revisão

Abrir ao clicar em "Revisar". Reutilizar a estrutura do `AprovacaoModal` do `EspacadoresTab.jsx`. Deve exibir **todos os campos** do levantamento:

- Data/hora formatada
- Tipo
- Local
- Técnico de origem
- Matrícula do autor
- Equipamento (se preenchido)
- Descrição (completa, sem truncamento)
- Observação (se preenchida)
- Recurso necessário (se preenchido)
- **Fotos em tamanho maior**, clicáveis para abrir em tamanho real (nova aba ou lightbox)

**Dois botões de ação:**

- ✅ **Aprovar** — executa a lógica de aprovação (seção 4)
- ❌ **Reprovar** — abre campo obrigatório de motivo antes de confirmar (reutilizar o padrão do `ReprovadoPopup`)

---

## 4. Lógica de aprovação — detalhe completo

### 4.1 Ao clicar em "Aprovar"

Execute na ordem:

**Passo 1 — Gerar novo ID sequencial para `servicos`**

Usar o mesmo padrão de geração de ID já usado no cadastro manual do painel (ex: prefixo de localidade + número sequencial, como `VD0456`). Consulte como isso é feito hoje no `CadastroForm` ou equivalente.

**Passo 2 — Inserir novo registro em `servicos`**

```js
await supabase.from('servicos').insert({
  id: novoIdGerado,           // string alfanumérica (ex: 'VD0456')
  local: levantamento.local,
  tipo: levantamento.tipo,
  desc: levantamento.descricao,
  equip: levantamento.equip || null,
  status: 'cadastrado',
  obs: levantamento.observacao || null,
  orig: levantamento.tecnico_origem,
  data: new Date().toISOString(),
  dtCadastro: new Date().toISOString(),
  autor: despachante.nome,
  matriculaAutor: despachante.matricula,
  atribuido_para: {
    matricula: levantamento.matricula_autor,
    // inclua o nome do técnico se disponível via join/lookup na tabela usuarios
  },
  dt_atribuicao: new Date().toISOString(),
  hist: [
    {
      who: despachante.nome,
      matricula: despachante.matricula,
      when: new Date().toISOString(),
      msg: 'Serviço gerado a partir de levantamento de campo aprovado.',
    }
  ],
});
```

> **Atenção:** O campo `id` de `servicos` é **text/string**, nunca número inteiro. O campo `atribuido_para` é **JSONB**. Para filtrar no app mobile usa-se o operador `->>`; ex: `.filter('atribuido_para->>matricula', 'eq', matricula)`.

**Passo 3 — Atualizar o levantamento**

```js
await supabase.from('levantamentos').update({
  status: 'aprovado',
  aprovado_por: { nome: despachante.nome, matricula: despachante.matricula },
  dt_aprovacao: new Date().toISOString(),
  servico_gerado_id: novoIdGerado,
}).eq('id', levantamento.id);
```

### 4.2 Ao clicar em "Reprovar"

- Exibir campo de texto obrigatório para o motivo.
- Ao confirmar:

```js
await supabase.from('levantamentos').update({
  status: 'reprovado',
  motivo_reprovacao: motivoTexto.trim(),
  aprovado_por: { nome: despachante.nome, matricula: despachante.matricula },
  dt_aprovacao: new Date().toISOString(),
}).eq('id', levantamento.id);
```

- **Não inserir nada em `servicos`**.
- O app mobile já monitora em tempo real e exibirá o motivo para o técnico automaticamente.

---

## 5. Realtime no painel web

Usar `postgres_changes` do Supabase para manter a lista de levantamentos atualizada ao vivo:

```js
const channel = supabase
  .channel('levantamentos_web')
  .on(
    'postgres_changes',
    { event: '*', schema: 'public', table: 'levantamentos' },
    () => fetchLevantamentos()
  )
  .subscribe();

// Cleanup obrigatório:
return () => supabase.removeChannel(channel);
```

---

## 6. Padrões técnicos obrigatórios

| Regra | Detalhe |
|---|---|
| **Banco de dados** | Usar exclusivamente Supabase (`supabase.from(...).select/insert/update`). Não usar Firebase. |
| **snake_case** | Todos os nomes de coluna da tabela `levantamentos` estão em `snake_case`. Usar exatamente como estão. |
| **JSONB operator** | Para filtrar campos JSONB em `servicos` (ex: `atribuido_para`), usar `->>` e nunca `->`. |
| **ID de servicos** | O campo `id` da tabela `servicos` é `text` (ex: `'VD0456'`), nunca fazer `parseInt()`. |
| **Status válidos** | Em `levantamentos`: `'pendente'`, `'aprovado'`, `'reprovado'`. Em `servicos` ao criar: `'cadastrado'`. |
| **Componentes visuais** | Reutilizar: `POPUP_OVERLAY`, `POPUP_BOX`, `BTN_PRIMARY`, `BTN_CANCEL`, `inputStyle`, `MultiSelect`, `Paginacao` — não recriar do zero. |
| **Realtime cleanup** | Sempre chamar `supabase.removeChannel(channel)` no cleanup do `useEffect`. |

---

## 7. Resumo das queries necessárias

```js
// Buscar levantamentos pendentes
supabase.from('levantamentos')
  .select('*')
  .eq('status', 'pendente')
  .order('criado_em', { ascending: false });

// Buscar levantamentos aprovados
supabase.from('levantamentos')
  .select('*')
  .eq('status', 'aprovado')
  .order('dt_aprovacao', { ascending: false });

// Buscar levantamentos reprovados
supabase.from('levantamentos')
  .select('*')
  .eq('status', 'reprovado')
  .order('dt_aprovacao', { ascending: false });

// Contar pendentes (para badge na aba de navegação)
supabase.from('levantamentos')
  .select('id', { count: 'exact', head: true })
  .eq('status', 'pendente');
```

---

## 8. Resultado esperado no app mobile (para referência de integração)

Após a **aprovação**, o técnico verá na tela "Meus Levantamentos":
- Badge **verde** "Aprovado"
- Caixa verde: "Serviço gerado: **VD0456**"
- O serviço `VD0456` aparecerá automaticamente na lista de OS do técnico, já com `status = 'cadastrado'` e `atribuido_para.matricula` com a matrícula dele.

Após a **reprovação**:
- Badge **vermelho** "Reprovado"
- Caixa laranja com o `motivo_reprovacao` em destaque.
