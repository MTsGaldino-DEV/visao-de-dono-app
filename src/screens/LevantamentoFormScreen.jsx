import React, { useState, useEffect, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TextInput,
  TouchableOpacity,
  ScrollView,
  Image,
  ActivityIndicator,
  Alert,
  Modal,
  KeyboardAvoidingView,
  Platform,
  FlatList,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useNavigation, CommonActions } from '@react-navigation/native';
import { Ionicons } from '@expo/vector-icons';
import * as ImagePicker from 'expo-image-picker';
import * as ImageManipulator from 'expo-image-manipulator';
import * as FileSystem from 'expo-file-system/legacy';
import { decode } from 'base64-arraybuffer';

import { supabase } from '../lib/supabase';
import { useAuth } from '../context/AuthContext';
import { CORES } from '../constants/CORES';
import { takePhotoAsync } from '../../modules/notecam';

// ── Constantes ─────────────────────────────────────────────────────────────────
const TIPOS_SERVICO = ['NSIS', 'NSCP', 'RC02', 'INBE'];
const MAX_FOTOS = 3;

const POSTOS = {
  'Posto 1 — Pedro': [
    'Frei Inocêncio', 'Alpercata', 'Alvarenga', 'Capitão Andrade', 'Engenheiro Caldas',
    'Fernandes Tourinho', 'Governador Valadares', 'Itanhomi', 'Jampruca', 'Jataí',
    'Mathias Lobato', 'São Geraldo do Tumiritinga', 'Sobrália', 'Tarumirim', 'Tumiritinga',
  ],
  'Posto 2 — Elton': [
    'Coluna', 'São Geraldo da Piedade', 'Água Boa', 'José Raydan', 'Paulistas',
    'Cantagalo', 'Peçanha', 'São João Evangelista', 'São José do Jacuri',
    'Santa Efigênia de Minas', 'Gonzaga', 'Santa Maria do Suaçuí', 'Frei Lago Negro',
    'São Pedro do Suaçuí', 'São Sebastião do Maranhão', 'Sardoá',
  ],
  'Posto 3 — Vinicius': [
    'Cuparaque', 'Conselheiro Pena', 'Resplendor', 'Aimorés', 'Goiabeira',
    'Itueta', 'Santa Rita do Itueto', 'São Geraldo do Baixio', 'Galileia',
  ],
  'Posto 4 — Victor': [
    'Itabirinha de Mantena', 'Divino das Laranjeiras', 'Central de Minas', 'Mendes Pimentel',
    'Nova Belém', 'São Félix de Minas', 'Tipiti', 'Mantena', 'São João do Manteninha',
    'Marilac', 'Coroaci', 'Virgolândia', 'Nacip Raydan', 'São José da Safira',
  ],
};

const TODAS_LOCALIDADES = Object.values(POSTOS).flat().sort();

// ── Componente de campo ────────────────────────────────────────────────────────
function CampoLabel({ label, obrigatorio = false }) {
  return (
    <Text style={styles.fieldLabel}>
      {label}
      {obrigatorio && <Text style={styles.fieldLabelObrig}> *</Text>}
    </Text>
  );
}

// ── Tela Principal ─────────────────────────────────────────────────────────────
export default function LevantamentoFormScreen() {
  const navigation = useNavigation();
  const { user } = useAuth();

  // Campos do formulário
  const [dataHora, setDataHora] = useState(new Date().toLocaleString('pt-BR'));
  const [equip, setEquip] = useState('');
  const [local, setLocal] = useState('');
  const [tipo, setTipo] = useState('');
  const [tecnicoOrigem, setTecnicoOrigem] = useState('');
  const [descricao, setDescricao] = useState('');
  const [observacao, setObservacao] = useState('');
  const [recursoNecessario, setRecursoNecessario] = useState('');
  const [fotos, setFotos] = useState([]); // array de { uri, localUri }

  // UI state
  const [loadingMsg, setLoadingMsg] = useState('');
  const [erros, setErros] = useState({});
  const [showTipoModal, setShowTipoModal] = useState(false);
  const [showLocalModal, setShowLocalModal] = useState(false);
  const [localSearch, setLocalSearch] = useState('');

  const localidadesFiltradas = TODAS_LOCALIDADES.filter((l) =>
    l.toLowerCase().includes(localSearch.toLowerCase())
  );

  // ── Validação ────────────────────────────────────────────────────────────────
  function validate() {
    const e = {};
    if (!equip.trim()) e.equip = 'Equipamento/Trafo é obrigatório.';
    if (!local.trim()) e.local = 'Localidade é obrigatória.';
    if (!tipo) e.tipo = 'Tipo de serviço é obrigatório.';
    if (!tecnicoOrigem.trim()) e.tecnicoOrigem = 'Técnico de origem é obrigatório.';
    if (!descricao.trim()) e.descricao = 'Descrição é obrigatória.';

    // DESCOMENTE A LINHA ABAIXO NO FUTURO PARA TORNAR A FOTO OBRIGATÓRIA NOVAMENTE:
    // if (fotos.length === 0) e.fotos = 'Adicione ao menos 1 foto.';

    setErros(e);
    return Object.keys(e).length === 0;
  }

  // ── Foto: escolher origem ────────────────────────────────────────────────────
  function handleAddFoto() {
    if (fotos.length >= MAX_FOTOS) {
      Alert.alert('Limite atingido', `Você pode adicionar no máximo ${MAX_FOTOS} fotos.`);
      return;
    }
    Alert.alert('Adicionar Foto', 'Escolha a origem da foto', [
      { text: 'Câmera', onPress: () => pickFoto('camera') },
      { text: 'Galeria', onPress: () => pickFoto('gallery') },
      { text: 'Cancelar', style: 'cancel' },
    ]);
  }

  async function pickFoto(origem) {
    try {
      let finalUri = null;

      if (origem === 'camera') {
        try {
          // Tenta abrir a câmera customizada (NoteCam)
          const uri = await takePhotoAsync();
          if (uri) {
            finalUri = uri;
          }
        } catch (noteCamError) {
          console.log("Fallback para câmera nativa:", noteCamError);
          // Fallback: usar câmera normal do expo-image-picker
          const perm = await ImagePicker.requestCameraPermissionsAsync();
          if (!perm.granted) {
            Alert.alert('Permissão negada', 'Precisamos de permissão para acessar a câmera.');
            return;
          }
          const result = await ImagePicker.launchCameraAsync({ quality: 1, mediaTypes: ImagePicker.MediaTypeOptions.Images });
          if (!result.canceled && result.assets?.length) {
            finalUri = result.assets[0].uri;
          }
        }
      } else {
        const result = await ImagePicker.launchImageLibraryAsync({ quality: 1, mediaTypes: ImagePicker.MediaTypeOptions.Images });
        if (!result.canceled && result.assets?.length) {
          finalUri = result.assets[0].uri;
        }
      }

      if (!finalUri) return;

      setLoadingMsg('Processando foto...');
      const manipResult = await ImageManipulator.manipulateAsync(
        finalUri,
        [{ resize: { width: 1280 } }],
        { compress: 0.75, format: ImageManipulator.SaveFormat.JPEG }
      );

      setFotos((prev) => [...prev, { uri: manipResult.uri }]);
      if (erros.fotos) setErros((e) => ({ ...e, fotos: undefined }));
    } catch (err) {
      console.error(err);
      Alert.alert('Erro', 'Não foi possível processar a foto.');
    } finally {
      setLoadingMsg('');
    }
  }

  function removerFoto(index) {
    setFotos((prev) => prev.filter((_, i) => i !== index));
  }

  // ── Upload de foto para Storage ──────────────────────────────────────────────
  async function uploadFoto(fotoObj, index) {
    const base64 = await FileSystem.readAsStringAsync(fotoObj.uri, {
      encoding: FileSystem.EncodingType.Base64,
    });
    const fileName = `${user.uid}/${Date.now()}_foto${index + 1}.jpg`;
    const { error } = await supabase.storage
      .from('levantamentos')
      .upload(fileName, decode(base64), { contentType: 'image/jpeg', upsert: true });
    if (error) throw error;
    const { data: publicData } = supabase.storage
      .from('levantamentos')
      .getPublicUrl(fileName);
    return publicData.publicUrl;
  }

  // ── Envio ────────────────────────────────────────────────────────────────────
  async function handleEnviar() {
    if (!validate()) return;

    setLoadingMsg('Enviando fotos...');
    try {
      // Upload de todas as fotos
      const urlsFotos = [];
      for (let i = 0; i < fotos.length; i++) {
        setLoadingMsg(`Enviando foto ${i + 1} de ${fotos.length}...`);
        const url = await uploadFoto(fotos[i], i);
        urlsFotos.push(url);
      }

      setLoadingMsg('Salvando levantamento...');

      const { error } = await supabase.from('levantamentos').insert({
        data_hora: new Date().toISOString(),
        equip: equip.trim() || null,
        local: local.trim(),
        tipo,
        tecnico_origem: tecnicoOrigem.trim(),
        matricula_autor: user.matricula,
        descricao: descricao.trim(),
        observacao: observacao.trim() || null,
        recurso_necessario: recursoNecessario.trim() || null,
        fotos: urlsFotos,
        status: 'pendente',
      });

      if (error) throw error;

      Alert.alert(
        'Levantamento enviado!',
        'Seu levantamento foi enviado com sucesso e está aguardando aprovação.',
        [
          {
            text: 'OK',
            onPress: () =>
              navigation.dispatch(
                CommonActions.reset({ index: 0, routes: [{ name: 'ListaServicos' }] })
              ),
          },
        ]
      );
    } catch (err) {
      console.error(err);
      Alert.alert('Erro', 'Não foi possível enviar o levantamento: ' + (err.message || JSON.stringify(err)));
    } finally {
      setLoadingMsg('');
    }
  }

  // ── Render ───────────────────────────────────────────────────────────────────
  return (
    <SafeAreaView style={styles.container} edges={['bottom', 'left', 'right']}>
      <KeyboardAvoidingView
        style={styles.flex}
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        keyboardVerticalOffset={Platform.OS === 'ios' ? 80 : 0}
      >
        <ScrollView contentContainerStyle={styles.scrollContent} showsVerticalScrollIndicator={false}>

          {/* ── Data/Hora ── */}
          <View style={styles.card}>
            <CampoLabel label="Data e Hora" obrigatorio />
            <TextInput
              style={styles.input}
              value={dataHora}
              onChangeText={setDataHora}
              placeholder="Ex: 30/06/2026 14:35"
              placeholderTextColor={CORES.textoMuted}
            />
          </View>

          {/* ── Equip/Trafo ── */}
          <View style={styles.card}>
            <CampoLabel label="Equip / Trafo" obrigatorio />
            <TextInput
              style={[styles.input, erros.equip && styles.inputError]}
              value={equip}
              onChangeText={(t) => { setEquip(t.replace(/[^0-9\-]/g, '')); if (erros.equip) setErros((e) => ({ ...e, equip: undefined })); }}
              placeholder="Ex: 12345 ou 123-456"
              placeholderTextColor={CORES.textoMuted}
              keyboardType="numbers-and-punctuation"
            />
            {erros.equip && <Text style={styles.erroTexto}>{erros.equip}</Text>}
          </View>

          {/* ── Localidade ── */}
          <View style={styles.card}>
            <CampoLabel label="Localidade" obrigatorio />
            <TouchableOpacity
              style={[styles.picker, erros.local && styles.inputError]}
              onPress={() => { setLocalSearch(''); setShowLocalModal(true); }}
            >
              <Text style={local ? styles.pickerText : styles.pickerPlaceholder} numberOfLines={1}>
                {local || 'Selecione ou digite a localidade...'}
              </Text>
              <Ionicons name="chevron-down" size={16} color={CORES.textoMuted} />
            </TouchableOpacity>
            {erros.local && <Text style={styles.erroTexto}>{erros.local}</Text>}
          </View>

          {/* ── Tipo de Serviço ── */}
          <View style={styles.card}>
            <CampoLabel label="Tipo de Serviço" obrigatorio />
            <TouchableOpacity
              style={[styles.picker, erros.tipo && styles.inputError]}
              onPress={() => setShowTipoModal(true)}
            >
              <Text style={tipo ? styles.pickerText : styles.pickerPlaceholder}>
                {tipo || 'Selecione o tipo...'}
              </Text>
              <Ionicons name="chevron-down" size={16} color={CORES.textoMuted} />
            </TouchableOpacity>
            {erros.tipo && <Text style={styles.erroTexto}>{erros.tipo}</Text>}
          </View>

          {/* ── Técnico de Origem ── */}
          <View style={styles.card}>
            <CampoLabel label="Técnico de Origem (Equipe)" obrigatorio />
            <TextInput
              style={[styles.input, erros.tecnicoOrigem && styles.inputError]}
              value={tecnicoOrigem}
              onChangeText={(t) => { setTecnicoOrigem(t); if (erros.tecnicoOrigem) setErros((e) => ({ ...e, tecnicoOrigem: undefined })); }}
              placeholder="Nome da equipe ou técnico"
              placeholderTextColor={CORES.textoMuted}
            />
            {erros.tecnicoOrigem && <Text style={styles.erroTexto}>{erros.tecnicoOrigem}</Text>}
          </View>

          {/* ── Descrição ── */}
          <View style={styles.card}>
            <CampoLabel label="Descrição da Solicitação" obrigatorio />
            <TextInput
              style={[styles.inputArea, erros.descricao && styles.inputError]}
              value={descricao}
              onChangeText={(t) => { setDescricao(t); if (erros.descricao) setErros((e) => ({ ...e, descricao: undefined })); }}
              placeholder="Descreva o que foi identificado em campo..."
              placeholderTextColor={CORES.textoMuted}
              multiline
              numberOfLines={4}
              textAlignVertical="top"
            />
            {erros.descricao && <Text style={styles.erroTexto}>{erros.descricao}</Text>}
          </View>

          {/* ── Observação ── */}
          <View style={styles.card}>
            <CampoLabel label="Observação" />
            <TextInput
              style={styles.inputArea}
              value={observacao}
              onChangeText={setObservacao}
              placeholder="Observações adicionais (opcional)"
              placeholderTextColor={CORES.textoMuted}
              multiline
              numberOfLines={3}
              textAlignVertical="top"
            />
          </View>

          {/* ── Recurso Necessário ── */}
          <View style={styles.card}>
            <CampoLabel label="Recurso Necessário" />
            <TextInput
              style={styles.input}
              value={recursoNecessario}
              onChangeText={setRecursoNecessario}
              placeholder="Ex: Escada telesc., EPIs, etc. (opcional)"
              placeholderTextColor={CORES.textoMuted}
            />
          </View>

          {/* ── Fotos ── */}
          <View style={styles.card}>
            {/* COLOQUE A PROPRIEDADE 'obrigatorio' DE VOLTA NO CampoLabel PARA INDICAÇÃO VISUAL:
                Ex: <CampoLabel label={`Fotos (${fotos.length}/${MAX_FOTOS})`} obrigatorio /> */}
            <CampoLabel label={`Fotos (${fotos.length}/${MAX_FOTOS})`} />
            {erros.fotos && <Text style={[styles.erroTexto, { marginBottom: 8 }]}>{erros.fotos}</Text>}

            <View style={styles.fotosGrid}>
              {fotos.map((f, i) => (
                <View key={i} style={styles.fotoItem}>
                  <Image source={{ uri: f.uri }} style={styles.fotoThumb} />
                  <TouchableOpacity style={styles.fotoRemoverBtn} onPress={() => removerFoto(i)}>
                    <Ionicons name="close-circle" size={22} color={CORES.erro} />
                  </TouchableOpacity>
                </View>
              ))}

              {fotos.length < MAX_FOTOS && (
                <TouchableOpacity
                  style={[styles.fotoAddBtn, erros.fotos && styles.fotoAddBtnError]}
                  onPress={handleAddFoto}
                  disabled={!!loadingMsg}
                >
                  <Ionicons name="camera-outline" size={28} color={CORES.azulAcao} />
                  <Text style={styles.fotoAddText}>Adicionar</Text>
                </TouchableOpacity>
              )}
            </View>
          </View>

          {/* Aviso de matrícula */}
          <View style={styles.infoBox}>
            <Ionicons name="information-circle-outline" size={16} color={CORES.azulAcao} />
            <Text style={styles.infoText}>
              Este levantamento será vinculado à sua matrícula: <Text style={styles.infoTextBold}>{user?.matricula}</Text>
            </Text>
          </View>

        </ScrollView>

        {/* ── Footer ── */}
        <View style={styles.footer}>
          {loadingMsg ? (
            <View style={styles.loadingRow}>
              <ActivityIndicator size="small" color={CORES.primario} />
              <Text style={styles.loadingText}>{loadingMsg}</Text>
            </View>
          ) : (
            <TouchableOpacity style={styles.btnEnviar} onPress={handleEnviar}>
              <Ionicons name="send" size={18} color="#fff" />
              <Text style={styles.btnEnviarText}>Enviar Levantamento</Text>
            </TouchableOpacity>
          )}
        </View>
      </KeyboardAvoidingView>

      {/* ── Modal: Tipo de Serviço ── */}
      <Modal
        visible={showTipoModal}
        transparent
        animationType="slide"
        onRequestClose={() => setShowTipoModal(false)}
      >
        <View style={styles.modalOverlay}>
          <TouchableOpacity style={styles.modalBackdrop} onPress={() => setShowTipoModal(false)} />
          <View style={styles.bottomSheet}>
            <Text style={styles.sheetTitle}>Tipo de Serviço</Text>
            {TIPOS_SERVICO.map((t) => (
              <TouchableOpacity
                key={t}
                style={[styles.sheetOption, tipo === t && styles.sheetOptionActive]}
                onPress={() => {
                  setTipo(t);
                  setShowTipoModal(false);
                  if (erros.tipo) setErros((e) => ({ ...e, tipo: undefined }));
                }}
              >
                <Text style={[styles.sheetOptionText, tipo === t && styles.sheetOptionTextActive]}>
                  {t}
                </Text>
                {tipo === t && <Ionicons name="checkmark" size={18} color={CORES.azulAcao} />}
              </TouchableOpacity>
            ))}
          </View>
        </View>
      </Modal>

      {/* ── Modal: Localidade ── */}
      <Modal
        visible={showLocalModal}
        transparent
        animationType="slide"
        onRequestClose={() => setShowLocalModal(false)}
      >
        <View style={styles.modalOverlay}>
          <TouchableOpacity style={styles.modalBackdrop} onPress={() => setShowLocalModal(false)} />
          <View style={[styles.bottomSheet, { maxHeight: '75%' }]}>
            <Text style={styles.sheetTitle}>Localidade</Text>
            <TextInput
              style={styles.sheetSearch}
              value={localSearch}
              onChangeText={setLocalSearch}
              placeholder="Buscar ou digitar localidade..."
              placeholderTextColor={CORES.textoMuted}
              autoFocus
            />
            <FlatList
              data={localidadesFiltradas}
              keyExtractor={(item) => item}
              renderItem={({ item }) => (
                <TouchableOpacity
                  style={[styles.sheetOption, local === item && styles.sheetOptionActive]}
                  onPress={() => {
                    setLocal(item);
                    setShowLocalModal(false);
                    if (erros.local) setErros((e) => ({ ...e, local: undefined }));
                  }}
                >
                  <Text style={[styles.sheetOptionText, local === item && styles.sheetOptionTextActive]}>
                    {item}
                  </Text>
                  {local === item && <Ionicons name="checkmark" size={18} color={CORES.azulAcao} />}
                </TouchableOpacity>
              )}
              ListFooterComponent={
                localSearch.trim() && !localidadesFiltradas.includes(localSearch.trim()) ? (
                  <TouchableOpacity
                    style={styles.sheetOptionManual}
                    onPress={() => {
                      setLocal(localSearch.trim());
                      setShowLocalModal(false);
                      if (erros.local) setErros((e) => ({ ...e, local: undefined }));
                    }}
                  >
                    <Ionicons name="add-circle-outline" size={16} color={CORES.azulAcao} />
                    <Text style={styles.sheetOptionManualText}>
                      Usar "{localSearch.trim()}"
                    </Text>
                  </TouchableOpacity>
                ) : null
              }
              keyboardShouldPersistTaps="handled"
              style={{ maxHeight: 320 }}
            />
          </View>
        </View>
      </Modal>
    </SafeAreaView>
  );
}

// ── Estilos ────────────────────────────────────────────────────────────────────
const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: CORES.bgGlobal },
  flex: { flex: 1 },
  scrollContent: { padding: 16, paddingBottom: 32 },

  card: {
    backgroundColor: CORES.bgCard,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: CORES.bordaPadrao,
    padding: 16,
    marginBottom: 12,
  },
  fieldLabel: {
    fontSize: 11,
    fontWeight: '700',
    color: CORES.textoMuted,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    marginBottom: 10,
  },
  fieldLabelObrig: { color: CORES.erro },

  input: {
    backgroundColor: CORES.bgInput,
    borderWidth: 1,
    borderColor: CORES.bordaPadrao,
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 11,
    fontSize: 15,
    color: CORES.textoPrincipal,
  },
  inputArea: {
    backgroundColor: CORES.bgInput,
    borderWidth: 1,
    borderColor: CORES.bordaPadrao,
    borderRadius: 10,
    padding: 12,
    fontSize: 15,
    color: CORES.textoPrincipal,
    minHeight: 90,
    textAlignVertical: 'top',
  },
  inputError: {
    borderColor: CORES.erro,
    borderWidth: 1.5,
  },
  erroTexto: {
    fontSize: 12,
    color: CORES.erro,
    marginTop: 4,
  },

  picker: {
    backgroundColor: CORES.bgInput,
    borderWidth: 1,
    borderColor: CORES.bordaPadrao,
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 11,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  pickerText: { fontSize: 15, color: CORES.textoPrincipal, flex: 1 },
  pickerPlaceholder: { fontSize: 15, color: CORES.textoMuted, flex: 1 },

  // Fotos
  fotosGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10,
    marginTop: 4,
  },
  fotoItem: {
    width: 90,
    height: 90,
    borderRadius: 10,
    overflow: 'visible',
    position: 'relative',
  },
  fotoThumb: {
    width: 90,
    height: 90,
    borderRadius: 10,
    backgroundColor: CORES.bordaPadrao,
  },
  fotoRemoverBtn: {
    position: 'absolute',
    top: -8,
    right: -8,
    backgroundColor: '#fff',
    borderRadius: 11,
  },
  fotoAddBtn: {
    width: 90,
    height: 90,
    borderRadius: 10,
    borderWidth: 1.5,
    borderColor: CORES.azulAcao,
    borderStyle: 'dashed',
    backgroundColor: '#eff6ff',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 4,
  },
  fotoAddBtnError: {
    borderColor: CORES.erro,
    backgroundColor: CORES.erroBg,
  },
  fotoAddText: {
    fontSize: 11,
    color: CORES.azulAcao,
    fontWeight: '600',
  },

  // Info box
  infoBox: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 8,
    backgroundColor: '#eff6ff',
    borderWidth: 1,
    borderColor: '#bfdbfe',
    borderRadius: 10,
    padding: 12,
    marginBottom: 12,
  },
  infoText: { fontSize: 13, color: '#1e40af', flex: 1, lineHeight: 18 },
  infoTextBold: { fontWeight: '700' },

  // Footer
  footer: {
    backgroundColor: CORES.bgCard,
    padding: 16,
    borderTopWidth: 1,
    borderTopColor: CORES.bordaPadrao,
  },
  loadingRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 10,
    paddingVertical: 14,
  },
  loadingText: { fontSize: 14, color: CORES.primario, fontWeight: '600' },
  btnEnviar: {
    backgroundColor: CORES.primario,
    borderRadius: 12,
    paddingVertical: 15,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 10,
    shadowColor: CORES.primario,
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.3,
    shadowRadius: 6,
    elevation: 4,
  },
  btnEnviarText: { color: '#fff', fontSize: 16, fontWeight: '700', letterSpacing: 0.3 },

  // Modal / Bottom Sheet
  modalOverlay: { flex: 1, justifyContent: 'flex-end', backgroundColor: 'rgba(0,0,0,0.45)' },
  modalBackdrop: { flex: 1 },
  bottomSheet: {
    backgroundColor: CORES.bgCard,
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    padding: 24,
    paddingBottom: Platform.OS === 'ios' ? 42 : 24,
  },
  sheetTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: CORES.textoPrincipal,
    marginBottom: 16,
  },
  sheetSearch: {
    backgroundColor: CORES.bgInput,
    borderWidth: 1,
    borderColor: CORES.bordaPadrao,
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 15,
    color: CORES.textoPrincipal,
    marginBottom: 12,
  },
  sheetOption: {
    paddingVertical: 14,
    borderBottomWidth: 1,
    borderBottomColor: CORES.bordaPadrao,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  sheetOptionActive: { backgroundColor: '#f0f7ff', borderRadius: 8, paddingHorizontal: 8, marginHorizontal: -8 },
  sheetOptionText: { fontSize: 15, color: CORES.textoPrincipal },
  sheetOptionTextActive: { color: CORES.azulAcao, fontWeight: '600' },
  sheetOptionManual: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingVertical: 14,
    paddingHorizontal: 4,
  },
  sheetOptionManualText: { fontSize: 14, color: CORES.azulAcao, fontWeight: '600' },
});
