# Visão de Dono — App Técnico
 
App mobile para técnicos de campo que atuam em serviços elétricos junto a
contratados da CEMIG na região de Governador Valadares (MG). Faz parte do
ecossistema **Visão de Dono**, que também inclui um dashboard web para gestão
e acompanhamento dos serviços.
 
Construído com **Expo** e **React Native**, usando **Supabase** como backend
(autenticação, banco de dados e storage).
 
## ✨ Funcionalidades
 
- **Login por matrícula**, com sessão de 12h e perfis distintos: `dono`,
  `despachante`, `tecnico` e `levantador`.
- **Listagem de serviços atribuídos** ao técnico ou à sua equipe.
- **Mapa interativo** com pins nas coordenadas exatas de cada serviço, cores
  por status, e opção de traçar rota direto no Google Maps.
- **Fluxo de acionamento**: uma equipe só pode ter 1 serviço acionado por vez,
  com opção de cancelar ou trocar o acionamento a qualquer momento.
- **Execução de serviço** com captura obrigatória de fotos **antes** e
  **depois** (mínimo 1, até 3 cada), usando o app **NoteCam** para fotos com
  carimbo de GPS/data.
- **Levantamento de campo**: cadastro de novos serviços diretamente pela
  equipe em campo, incluindo fotos e detecção de duplicidade por equipamento.
- **Detalhes da nota de serviço** com histórico completo, fotos (renderizadas
  inline quando vindas do Storage, como link quando inseridas manualmente via
  painel web) e status visual.
## 🛠️ Stack
 
- [Expo](https://expo.dev) (SDK 56) + React Native
- [Supabase](https://supabase.com) — Auth, Postgres (RLS) e Storage
- `react-native-maps` (Google Maps) para visualização geográfica
- `expo-image-picker` / módulo nativo customizado para integração com o
  NoteCam
- EAS Build para geração de builds Android
## 📁 Estrutura do projeto
 
```
visao-de-dono-app/
├── src/
│   ├── screens/          # Telas do app (execução, detalhes, mapa, etc.)
│   ├── components/        # Componentes reutilizáveis
│   └── contexts/          # AuthContext e outros contexts
├── modules/
│   └── notecam/           # Módulo nativo Expo para integração com o NoteCam
├── app.json                # Configuração Expo (inclui API key do Google Maps)    
├── eas.json                 # Perfis de build (development, preview, production)
└── App.js
```
### Pré-requisitos
 
- Node.js 20+
- Conta Expo/EAS configurada (`eas login`)
- Acesso ao projeto Supabase (URL + chave anon)
- Dispositivo Android físico ou emulador (o app usa módulos nativos
  customizados — **não roda no Expo Go**, é necessário um build de
  desenvolvimento)

## 🔐 Notas de segurança
 
- Nunca commitar `.env`, arquivos `.keystore`/`.jks`, ou qualquer credencial —
  já cobertos pelo `.gitignore`.
- A API key do Google Maps é restrita por pacote + SHA-1 no Google Cloud
  Console.
- Row Level Security (RLS) habilitado no Supabase garante que cada técnico
  só visualize os serviços atribuídos a ele ou à sua equipe.
## 📄 Licença
 
Projeto privado — uso interno restrito à equipe de contratados da CEMIG na
região de Governador Valadares.
