import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  Image,
  TextInput,
  ActivityIndicator,
  Alert,
  ScrollView,
  KeyboardAvoidingView,
  Platform,
  Linking,
  Modal,
} from 'react-native';
import { useRoute, useNavigation, CommonActions } from '@react-navigation/native';
import { SafeAreaView } from 'react-native-safe-area-context';
import NetInfo from '@react-native-community/netinfo';
import * as ImagePicker from 'expo-image-picker';
import * as ImageManipulator from 'expo-image-manipulator';
import { Ionicons } from '@expo/vector-icons';
import * as FileSystem from 'expo-file-system/legacy';
import { decode } from 'base64-arraybuffer';

import { supabase } from '../lib/supabase';
import { useAuth } from '../context/AuthContext';
import { CORES } from '../constants/CORES';
import { takePhotoAsync } from '../../modules/notecam';

// ─── Constantes ───────────────────────────────────────────────────────────────
const MATERIAIS_OPCOES = ['384313 - ESPACADOR RD NUA BT AUTOTRAV INST'];
const MAX_FOTOS = 3;

// ─── Componente de seção de fotos ─────────────────────────────────────────────
function FotoSection({ titulo, fotos, onAdd, onRemove, loading }) {
  const atingiuMinimo = fotos.length >= 1;
  const atingiuMaximo = fotos.length >= MAX_FOTOS;

  return (
    <View style={sStyles.section}>
      {/* Cabeçalho da seção */}
      <View style={sStyles.header}>
        <View style={sStyles.headerLeft}>
          <Text style={sStyles.titulo}>{titulo.toUpperCase()}</Text>
          <View style={[sStyles.counter, atingiuMinimo && sStyles.counterOk]}>
            {atingiuMinimo ? (
              <Ionicons name="checkmark-circle" size={13} color="#16a34a" />
            ) : (
              <Ionicons name="alert-circle" size={13} color="#dc2626" />
            )}
            <Text style={[sStyles.counterText, atingiuMinimo && sStyles.counterTextOk]}>
              {fotos.length}/{MAX_FOTOS} foto{fotos.length !== 1 ? 's' : ''}
            </Text>
          </View>
        </View>
        {!atingiuMaximo && (
          <TouchableOpacity
            style={[sStyles.addBtn, loading && sStyles.addBtnDisabled]}
            onPress={onAdd}
            disabled={loading}
          >
            <Ionicons name="camera" size={16} color="#fff" />
            <Text style={sStyles.addBtnText}>Adicionar</Text>
          </TouchableOpacity>
        )}
      </View>

      {/* Aviso de obrigatoriedade */}
      {!atingiuMinimo && (
        <Text style={sStyles.aviso}>⚠️ Mínimo 1 foto obrigatória</Text>
      )}

      {/* Grade de miniaturas */}
      {fotos.length > 0 ? (
        <View style={sStyles.grade}>
          {fotos.map((f, i) => (
            <View key={i} style={sStyles.thumbWrapper}>
              <Image source={{ uri: f.uri }} style={sStyles.thumb} />
              <TouchableOpacity
                style={sStyles.removeBtn}
                onPress={() => onRemove(i)}
                disabled={loading}
              >
                <Ionicons name="close-circle" size={22} color="#ef4444" />
              </TouchableOpacity>
            </View>
          ))}
        </View>
      ) : (
        /* Área vazia clicável */
        <TouchableOpacity
          style={[sStyles.emptyArea, loading && sStyles.addBtnDisabled]}
          onPress={onAdd}
          disabled={loading}
        >
          <Ionicons name="camera-outline" size={28} color={CORES.textoMuted} />
          <Text style={sStyles.emptyText}>Toque para adicionar</Text>
        </TouchableOpacity>
      )}
    </View>
  );
}

// ─── Tela principal ───────────────────────────────────────────────────────────
export default function ExecucaoScreen() {
  const route = useRoute();
  const navigation = useNavigation();
  const { user } = useAuth();

  const servico = route.params?.servico;
  const servicoId = servico?.id;

  // Fotos locais (só sobem ao clicar Concluir)
  const [fotosAntes, setFotosAntes] = useState([]);
  const [fotosDepois, setFotosDepois] = useState([]);

  const [observacao, setObservacao] = useState('');
  const [material, setMaterial] = useState('');
  const [quantidade, setQuantidade] = useState('');

  const [loadingMsg, setLoadingMsg] = useState('');
  const [erro, setErro] = useState('');
  const [focusObs, setFocusObs] = useState(false);
  const [focusQtd, setFocusQtd] = useState(false);
  const [isOffline, setIsOffline] = useState(false);

  const [showMaterialModal, setShowMaterialModal] = useState(false);
  const [showReprovarModal, setShowReprovarModal] = useState(false);
  const [motivoReprovacao, setMotivoReprovacao] = useState('');
  const [erroReprovacao, setErroReprovacao] = useState('');

  useEffect(() => {
    (async () => {
      await ImagePicker.requestMediaLibraryPermissionsAsync();
    })();

    const unsubscribe = NetInfo.addEventListener((state) => {
      setIsOffline(state.isConnected === false);
    });
    return () => unsubscribe();
  }, []);

  // ── Captura de foto ──────────────────────────────────────────────────────────
  async function capturarFoto(setter) {
    try {
      let uri = null;

      // Tenta NoteCam (Intent implícito — usuário escolhe o app)
      try {
        uri = await takePhotoAsync();
      } catch (noteCamError) {
        console.log('[ExecucaoScreen] Fallback câmera nativa:', noteCamError.message);
      }

      // Fallback: câmera nativa do Expo
      if (!uri) {
        const perm = await ImagePicker.requestCameraPermissionsAsync();
        if (!perm.granted) {
          Alert.alert('Permissão negada', 'Precisamos de permissão para acessar a câmera.');
          return;
        }
        const result = await ImagePicker.launchCameraAsync({
          quality: 1,
          mediaTypes: ImagePicker.MediaTypeOptions.Images,
        });
        if (result.canceled || !result.assets?.length) return;
        uri = result.assets[0].uri;
      }

      if (!uri) return;

      // Processa (redimensiona + comprime) e adiciona localmente
      setLoadingMsg('Processando foto...');
      const manipResult = await ImageManipulator.manipulateAsync(
        uri,
        [{ resize: { width: 1280 } }],
        { compress: 0.75, format: ImageManipulator.SaveFormat.JPEG }
      );
      setter((prev) => [...prev, { uri: manipResult.uri }]);
    } catch (err) {
      console.error('[ExecucaoScreen] capturarFoto:', err);
      Alert.alert('Erro', 'Não foi possível processar a foto.');
    } finally {
      setLoadingMsg('');
    }
  }

  function adicionarAntes() {
    if (fotosAntes.length >= MAX_FOTOS) return;
    capturarFoto(setFotosAntes);
  }

  function adicionarDepois() {
    if (fotosDepois.length >= MAX_FOTOS) return;
    capturarFoto(setFotosDepois);
  }

  function removerAntes(index) {
    setFotosAntes((prev) => prev.filter((_, i) => i !== index));
  }

  function removerDepois(index) {
    setFotosDepois((prev) => prev.filter((_, i) => i !== index));
  }

  // ── Upload em lote ───────────────────────────────────────────────────────────
  async function uploadFoto(fotoObj, path) {
    const base64 = await FileSystem.readAsStringAsync(fotoObj.uri, {
      encoding: FileSystem.EncodingType.Base64,
    });
    const { error } = await supabase.storage
      .from('levantamentos')
      .upload(path, decode(base64), { contentType: 'image/jpeg', upsert: true });
    if (error) throw error;

    const { data: publicData } = supabase.storage
      .from('levantamentos')
      .getPublicUrl(path);
    return publicData.publicUrl;
  }

  // ── Concluir ─────────────────────────────────────────────────────────────────
  async function handleConcluir() {
    setErro('');

    if (fotosAntes.length === 0 || fotosDepois.length === 0) {
      setErro('Adicione ao menos 1 foto em cada seção (antes e depois).');
      return;
    }
    if (!(observacao || '').trim()) {
      setErro('É obrigatório preencher a observação.');
      return;
    }
    if (!material) {
      setErro('Selecione o material utilizado.');
      return;
    }
    if (!quantidade || isNaN(Number(quantidade)) || Number(quantidade) <= 0) {
      setErro('Informe uma quantidade válida para o material.');
      return;
    }

    try {
      const totalFotos = fotosAntes.length + fotosDepois.length;
      let uploadados = 0;

      // Upload fotos ANTES
      const urlsAntes = [];
      for (let i = 0; i < fotosAntes.length; i++) {
        uploadados++;
        setLoadingMsg(`Enviando foto ${uploadados}/${totalFotos}...`);
        const path = `fechamentos/${servicoId}/antes_${Date.now()}_${i}.jpg`;
        const url = await uploadFoto(fotosAntes[i], path);
        urlsAntes.push(url);
      }

      // Upload fotos DEPOIS
      const urlsDepois = [];
      for (let i = 0; i < fotosDepois.length; i++) {
        uploadados++;
        setLoadingMsg(`Enviando foto ${uploadados}/${totalFotos}...`);
        const path = `fechamentos/${servicoId}/depois_${Date.now()}_${i}.jpg`;
        const url = await uploadFoto(fotosDepois[i], path);
        urlsDepois.push(url);
      }

      setLoadingMsg('Salvando execução...');

      const execucao = {
        observacao,
        material,
        quantidade: Number(quantidade),
        dtConclusao: new Date().toISOString(),
      };

      const { error: servicoError } = await supabase
        .from('servicos')
        .update({
          status: 'concluido',
          execucao,
          fotos_antes: urlsAntes,
          fotos_depois: urlsDepois,
          // mantém compatibilidade com coluna legada fotos_fechamento
          fotos_fechamento: [...urlsAntes, ...urlsDepois],
        })
        .eq('id', servicoId);

      if (servicoError) throw servicoError;

      Alert.alert(
        'Serviço Concluído!',
        'O serviço foi finalizado com sucesso.',
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
    } catch (error) {
      console.error('[ExecucaoScreen] handleConcluir:', error);
      // Mantém o usuário na tela com as fotos locais — pode tentar novamente
      setErro('Erro ao enviar. Verifique sua conexão e tente novamente.');
    } finally {
      setLoadingMsg('');
    }
  }

  // ── Reprovar ─────────────────────────────────────────────────────────────────
  async function handleReprovar() {
    setErroReprovacao('');
    if (!motivoReprovacao?.trim()) {
      setErroReprovacao('O motivo da reprovação é obrigatório.');
      return;
    }

    setLoadingMsg('Reprovando serviço...');
    try {
      const { error } = await supabase
        .from('servicos')
        .update({
          status: 'reprovado',
          motivo_reprovacao: motivoReprovacao.trim(),
          hist: [
            ...(servico.hist || []),
            {
              who: user.label || 'Usuário',
              matricula: user.matricula,
              when: new Date().toISOString(),
              msg: `Reprovado em campo: ${motivoReprovacao.trim()}`,
            },
          ],
        })
        .eq('id', servicoId);

      if (error) throw error;

      Alert.alert('Serviço Reprovado', 'O serviço foi reprovado com sucesso.', [
        {
          text: 'OK',
          onPress: () =>
            navigation.dispatch(
              CommonActions.reset({ index: 0, routes: [{ name: 'ListaServicos' }] })
            ),
        },
      ]);
    } catch (error) {
      console.error(error);
      setErroReprovacao('Ocorreu um erro ao reprovar: ' + (error.message || JSON.stringify(error)));
    } finally {
      setLoadingMsg('');
      setShowReprovarModal(false);
    }
  }

  // ── Render ────────────────────────────────────────────────────────────────────
  const podeConludoir = fotosAntes.length >= 1 && fotosDepois.length >= 1;
  const isLoading = !!loadingMsg;

  return (
    <SafeAreaView style={styles.container} edges={['bottom', 'left', 'right']}>
      {isOffline && (
        <View style={styles.offlineBanner}>
          <Text style={styles.offlineText}>⚠️ Você está offline</Text>
        </View>
      )}

      <KeyboardAvoidingView
        style={styles.flex}
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        keyboardVerticalOffset={Platform.OS === 'ios' ? 80 : 0}
      >
        <ScrollView contentContainerStyle={styles.scrollContent} showsVerticalScrollIndicator={false}>
          <Text style={styles.pageSubtitle}>OS #{servicoId}</Text>

          {/* ── Fotos ANTES ── */}
          <View style={styles.card}>
            <FotoSection
              titulo="📷 Fotos antes"
              fotos={fotosAntes}
              onAdd={adicionarAntes}
              onRemove={removerAntes}
              loading={isLoading}
            />
          </View>

          {/* ── Fotos DEPOIS ── */}
          <View style={styles.card}>
            <FotoSection
              titulo="✅ Fotos depois"
              fotos={fotosDepois}
              onAdd={adicionarDepois}
              onRemove={removerDepois}
              loading={isLoading}
            />
          </View>

          {/* ── Observação ── */}
          <View style={styles.card}>
            <Text style={styles.sectionTitle}>OBSERVAÇÃO *</Text>
            <TextInput
              style={[styles.inputArea, focusObs && styles.inputAreaFocus]}
              placeholder="Descreva o que foi feito..."
              placeholderTextColor={CORES.textoMuted}
              multiline
              numberOfLines={4}
              value={observacao}
              onChangeText={(text) => {
                setObservacao(text);
                if (erro) setErro('');
              }}
              onFocus={() => setFocusObs(true)}
              onBlur={() => setFocusObs(false)}
              editable={!isLoading}
              textAlignVertical="top"
            />
          </View>

          {/* ── Material ── */}
          <View style={styles.card}>
            <Text style={styles.sectionTitle}>MATERIAL UTILIZADO *</Text>
            <View style={styles.materialRow}>
              <TouchableOpacity
                style={styles.materialSelectBtn}
                onPress={() => setShowMaterialModal(true)}
                disabled={isLoading}
              >
                <Text
                  style={material ? styles.materialSelectText : styles.materialPlaceholder}
                  numberOfLines={1}
                >
                  {material || 'Selecione o material'}
                </Text>
                <Text style={styles.materialSelectIcon}>▼</Text>
              </TouchableOpacity>

              <TextInput
                style={[styles.inputQtd, focusQtd && styles.inputAreaFocus]}
                placeholder="Qtd."
                placeholderTextColor={CORES.textoMuted}
                keyboardType="numeric"
                value={quantidade}
                onChangeText={(t) => {
                  setQuantidade(t);
                  if (erro) setErro('');
                }}
                onFocus={() => setFocusQtd(true)}
                onBlur={() => setFocusQtd(false)}
                editable={!isLoading}
              />
            </View>
          </View>

          {/* ── Erro ── */}
          {!!erro && (
            <View style={styles.erroBox}>
              <Text style={styles.erroText}>{erro}</Text>
            </View>
          )}
        </ScrollView>

        {/* ── Modal: Material ── */}
        <Modal
          visible={showMaterialModal}
          transparent
          animationType="slide"
          onRequestClose={() => setShowMaterialModal(false)}
        >
          <View style={styles.modalOverlay}>
            <TouchableOpacity
              style={styles.modalBackdrop}
              onPress={() => setShowMaterialModal(false)}
            />
            <View style={styles.bottomSheet}>
              <Text style={styles.sheetTitle}>Selecione o Material</Text>
              {MATERIAIS_OPCOES.map((mat) => (
                <TouchableOpacity
                  key={mat}
                  style={styles.sheetOption}
                  onPress={() => {
                    setMaterial(mat);
                    setShowMaterialModal(false);
                    if (erro) setErro('');
                  }}
                >
                  <Text style={styles.sheetOptionText}>{mat}</Text>
                </TouchableOpacity>
              ))}
            </View>
          </View>
        </Modal>

        {/* ── Modal: Reprovar ── */}
        <Modal
          visible={showReprovarModal}
          transparent
          animationType="fade"
          onRequestClose={() => setShowReprovarModal(false)}
        >
          <View style={styles.modalOverlayCenter}>
            <View style={styles.modalContent}>
              <Text style={styles.sheetTitle}>Reprovar Serviço</Text>
              <Text style={styles.reprovarDesc}>Descreva o motivo da reprovação:</Text>
              <TextInput
                style={[styles.inputArea, { minHeight: 80, marginBottom: 10 }]}
                placeholder="Ex: Falta de material, acesso bloqueado..."
                placeholderTextColor={CORES.textoMuted}
                multiline
                value={motivoReprovacao}
                onChangeText={(t) => {
                  setMotivoReprovacao(t);
                  if (erroReprovacao) setErroReprovacao('');
                }}
                textAlignVertical="top"
              />
              {!!erroReprovacao && (
                <Text style={styles.erroTextInline}>{erroReprovacao}</Text>
              )}
              <View style={styles.modalActions}>
                <TouchableOpacity
                  style={styles.modalBtnCancel}
                  onPress={() => setShowReprovarModal(false)}
                >
                  <Text style={styles.modalBtnCancelText}>Cancelar</Text>
                </TouchableOpacity>
                <TouchableOpacity style={styles.modalBtnConfirm} onPress={handleReprovar}>
                  <Text style={styles.modalBtnConfirmText}>Reprovar</Text>
                </TouchableOpacity>
              </View>
            </View>
          </View>
        </Modal>

        {/* ── Rodapé ── */}
        <View style={styles.footer}>
          {isLoading ? (
            <View style={styles.loadingContainer}>
              <ActivityIndicator size="small" color={CORES.primario} />
              <Text style={styles.loadingText}>{loadingMsg}</Text>
            </View>
          ) : (
            <View style={styles.footerActions}>
              <TouchableOpacity
                style={[styles.btnAction, styles.btnReprovar]}
                onPress={() => setShowReprovarModal(true)}
              >
                <Text style={styles.btnReprovarText}>Reprovar</Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={[
                  styles.btnAction,
                  styles.btnConcluir,
                  !podeConludoir && styles.btnConcluirDisabled,
                ]}
                onPress={handleConcluir}
                disabled={!podeConludoir}
              >
                <Text style={styles.btnConcluirText}>✅ Concluir</Text>
              </TouchableOpacity>
            </View>
          )}
        </View>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

// ─── Estilos da seção de fotos ────────────────────────────────────────────────
const sStyles = StyleSheet.create({
  section: {
    gap: 10,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  headerLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    flex: 1,
  },
  titulo: {
    fontSize: 11,
    fontWeight: '700',
    color: CORES.textoMuted,
    letterSpacing: 0.5,
  },
  counter: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
    backgroundColor: '#fef2f2',
    borderWidth: 1,
    borderColor: '#fecaca',
    borderRadius: 20,
    paddingHorizontal: 7,
    paddingVertical: 2,
  },
  counterOk: {
    backgroundColor: '#f0fdf4',
    borderColor: '#bbf7d0',
  },
  counterText: {
    fontSize: 11,
    fontWeight: '700',
    color: '#dc2626',
  },
  counterTextOk: {
    color: '#16a34a',
  },
  aviso: {
    fontSize: 12,
    color: '#dc2626',
    fontWeight: '500',
  },
  addBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    backgroundColor: CORES.azulAcao,
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 7,
  },
  addBtnDisabled: {
    opacity: 0.4,
  },
  addBtnText: {
    color: '#fff',
    fontSize: 13,
    fontWeight: '700',
  },
  grade: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10,
  },
  thumbWrapper: {
    width: 90,
    height: 90,
    borderRadius: 10,
    overflow: 'visible',
    position: 'relative',
  },
  thumb: {
    width: 90,
    height: 90,
    borderRadius: 10,
    backgroundColor: CORES.bordaPadrao,
  },
  removeBtn: {
    position: 'absolute',
    top: -8,
    right: -8,
    backgroundColor: '#fff',
    borderRadius: 11,
  },
  emptyArea: {
    borderWidth: 1.5,
    borderColor: CORES.bordaPadrao,
    borderStyle: 'dashed',
    borderRadius: 10,
    paddingVertical: 24,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    backgroundColor: '#f8fafc',
  },
  emptyText: {
    fontSize: 13,
    color: CORES.textoMuted,
    fontWeight: '500',
  },
});

// ─── Estilos da tela ──────────────────────────────────────────────────────────
const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: CORES.bgGlobal,
  },
  flex: {
    flex: 1,
  },
  offlineBanner: {
    backgroundColor: CORES.erroBg,
    paddingVertical: 6,
    alignItems: 'center',
    justifyContent: 'center',
  },
  offlineText: {
    color: CORES.erro,
    fontSize: 12,
    fontWeight: '700',
  },
  scrollContent: {
    padding: 16,
    paddingBottom: 32,
  },
  pageSubtitle: {
    fontSize: 16,
    fontWeight: '700',
    color: CORES.primario,
    marginBottom: 12,
    marginLeft: 4,
  },
  card: {
    backgroundColor: CORES.bgCard,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: CORES.bordaPadrao,
    padding: 16,
    marginBottom: 14,
  },
  sectionTitle: {
    fontSize: 11,
    fontWeight: '700',
    color: CORES.textoMuted,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    marginBottom: 12,
  },
  inputArea: {
    backgroundColor: CORES.bgInput,
    borderWidth: 1,
    borderColor: CORES.bordaPadrao,
    borderRadius: 10,
    padding: 12,
    fontSize: 15,
    color: CORES.textoPrincipal,
    minHeight: 100,
    textAlignVertical: 'top',
  },
  inputAreaFocus: {
    borderColor: CORES.azulAcao,
    borderWidth: 1.5,
  },
  materialRow: {
    flexDirection: 'row',
    gap: 12,
  },
  materialSelectBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: CORES.bgInput,
    borderWidth: 1,
    borderColor: CORES.bordaPadrao,
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 12,
  },
  materialPlaceholder: {
    color: CORES.textoMuted,
    fontSize: 15,
  },
  materialSelectText: {
    color: CORES.textoPrincipal,
    fontSize: 14,
    flex: 1,
  },
  materialSelectIcon: {
    color: CORES.textoMuted,
    fontSize: 12,
    marginLeft: 8,
  },
  inputQtd: {
    width: 80,
    backgroundColor: CORES.bgInput,
    borderWidth: 1,
    borderColor: CORES.bordaPadrao,
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 12,
    fontSize: 15,
    color: CORES.textoPrincipal,
    textAlign: 'center',
  },
  erroBox: {
    backgroundColor: CORES.erroBg,
    padding: 12,
    borderRadius: 8,
    marginBottom: 16,
    borderWidth: 1,
    borderColor: '#fecaca',
  },
  erroText: {
    color: CORES.erro,
    fontSize: 13,
    fontWeight: '600',
    textAlign: 'center',
  },
  // Footer
  footer: {
    backgroundColor: CORES.bgCard,
    padding: 16,
    borderTopWidth: 1,
    borderTopColor: CORES.bordaPadrao,
  },
  loadingContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 14,
    gap: 10,
  },
  loadingText: {
    color: CORES.primario,
    fontSize: 14,
    fontWeight: '600',
  },
  footerActions: {
    flexDirection: 'row',
    gap: 12,
  },
  btnAction: {
    flex: 1,
    borderRadius: 10,
    paddingVertical: 15,
    alignItems: 'center',
    justifyContent: 'center',
  },
  btnReprovar: {
    backgroundColor: '#fff1f2',
    borderWidth: 1,
    borderColor: '#fecdd3',
  },
  btnReprovarText: {
    color: '#dc2626',
    fontSize: 16,
    fontWeight: '700',
    letterSpacing: 0.3,
  },
  btnConcluir: {
    backgroundColor: CORES.primario,
  },
  btnConcluirDisabled: {
    backgroundColor: CORES.textoMuted,
    opacity: 0.55,
  },
  btnConcluirText: {
    color: '#ffffff',
    fontSize: 16,
    fontWeight: '700',
    letterSpacing: 0.3,
  },
  // Modais
  modalOverlay: {
    flex: 1,
    justifyContent: 'flex-end',
    backgroundColor: 'rgba(0,0,0,0.4)',
  },
  modalBackdrop: {
    flex: 1,
  },
  bottomSheet: {
    backgroundColor: CORES.bgCard,
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    padding: 24,
    paddingBottom: Platform.OS === 'ios' ? 40 : 24,
  },
  sheetTitle: {
    fontSize: 18,
    fontWeight: '600',
    color: CORES.textoPrincipal,
    marginBottom: 20,
  },
  sheetOption: {
    paddingVertical: 16,
    borderBottomWidth: 1,
    borderBottomColor: CORES.bordaPadrao,
  },
  sheetOptionText: {
    fontSize: 15,
    color: CORES.textoPrincipal,
  },
  modalOverlayCenter: {
    flex: 1,
    justifyContent: 'center',
    backgroundColor: 'rgba(0,0,0,0.5)',
    padding: 20,
  },
  modalContent: {
    backgroundColor: CORES.bgCard,
    borderRadius: 16,
    padding: 20,
    elevation: 8,
  },
  reprovarDesc: {
    fontSize: 14,
    color: CORES.textoSecundario,
    marginBottom: 12,
  },
  erroTextInline: {
    color: CORES.erro,
    fontSize: 12,
    fontWeight: '600',
    marginBottom: 10,
  },
  modalActions: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    gap: 12,
    marginTop: 10,
  },
  modalBtnCancel: {
    paddingVertical: 10,
    paddingHorizontal: 16,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: CORES.bordaPadrao,
  },
  modalBtnCancelText: {
    color: CORES.textoSecundario,
    fontWeight: '600',
  },
  modalBtnConfirm: {
    backgroundColor: CORES.erro,
    paddingVertical: 10,
    paddingHorizontal: 16,
    borderRadius: 8,
  },
  modalBtnConfirmText: {
    color: '#fff',
    fontWeight: '600',
  },
});
