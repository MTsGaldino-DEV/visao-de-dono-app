import React, { useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  Linking,
  Alert,
  ActivityIndicator,
  Platform,
  Image,
} from 'react-native';
import { useRoute, useNavigation } from '@react-navigation/native';
import { SafeAreaView } from 'react-native-safe-area-context';
import NetInfo from '@react-native-community/netinfo';

import { supabase } from '../lib/supabase';
import { useAuth } from '../context/AuthContext';
import { CORES } from '../constants/CORES';
import { STATUS_CONFIG } from '../constants/STATUS_CONFIG';

function LabelValue({ label, value }) {
  if (!value) return null;
  return (
    <View style={styles.field}>
      <Text style={styles.label}>{label.toUpperCase()}</Text>
      <Text style={styles.value}>{value}</Text>
    </View>
  );
}

export default function DetalheServicoScreen() {
  const route = useRoute();
  const navigation = useNavigation();
  const { user } = useAuth();

  const [currentServico, setCurrentServico] = useState(route.params?.servico || {});
  const [updatingStatus, setUpdatingStatus] = useState(null); // guarda qual botão está carregando
  const [imageError, setImageError] = useState(false);

  const [isOffline, setIsOffline] = useState(false);

  // Monitora internet
  React.useEffect(() => {
    const unsubscribe = NetInfo.addEventListener((state) => {
      setIsOffline(state.isConnected === false);
    });
    return () => unsubscribe();
  }, []);

  // Tempo real para este serviço
  React.useEffect(() => {
    const channel = supabase
      .channel(`servico_detalhe_${currentServico.id}`)
      .on(
        'postgres_changes',
        { event: 'UPDATE', schema: 'public', table: 'servicos', filter: `id=eq.${currentServico.id}` },
        (payload) => {
          setCurrentServico(payload.new);
        }
      )
      .subscribe();

    return () => { supabase.removeChannel(channel); };
  }, [currentServico.id]);

  const statusInfo = STATUS_CONFIG[currentServico.status] || {
    bg: '#f8fafc', color: '#64748b', border: '#e2e8f0', label: currentServico.status,
  };

  function formatDate(isoString) {
    if (!isoString) return '';
    return new Date(isoString).toLocaleString('pt-BR');
  }

  function openMaps() {
    if (!currentServico.coord) return;

    // 1. Troca qualquer vírgula por ponto antes de processar
    const cleanCoord = currentServico.coord.replace(/,/g, '.').trim();
    
    // 2. Faz split por espaço para separar lat e lng
    const parts = cleanCoord.split(/\s+/);
    
    const lat = parseFloat(parts[0]);
    const lng = parseFloat(parts[1]);
    
    // 3. Valida que ambos são números válidos
    if (!isNaN(lat) && !isNaN(lng)) {
      // 4. Esquema de URI correto (Android = geo: , iOS = fallback p/ web ou maps)
      const androidUrl = `geo:${lat},${lng}?q=${lat},${lng}(Local do Serviço)`;
      const fallbackUrl = `https://www.google.com/maps/dir/?api=1&destination=${lat},${lng}`;

      const url = Platform.OS === 'android' ? androidUrl : fallbackUrl;

      Linking.openURL(url).catch(() => {
        // Fallback caso o dispositivo não consiga abrir a URI
        Linking.openURL(fallbackUrl).catch(() => {
          Alert.alert('Erro', 'Não foi possível abrir o mapa.');
        });
      });
    } else {
      // Alerta amigável se inválido
      Alert.alert('Atenção', 'As coordenadas cadastradas para este serviço são inválidas.');
    }
  }

  function openFoto() {
    if (currentServico.foto) Linking.openURL(currentServico.foto);
  }

  async function updateServicoStatus(newStatus, btnKey) {
    setUpdatingStatus(btnKey);
    try {
      const { error } = await supabase
        .from('servicos')
        .update({ status: newStatus })
        .eq('id', currentServico.id);

      if (error) throw error;
      setCurrentServico((prev) => ({ ...prev, status: newStatus }));
    } catch (error) {
      console.error(error);
      if (newStatus === 'acionado' && (error?.code === 'P0001' || (error?.message && error.message.toLowerCase().includes('acionad')))) {
        Alert.alert('Ação bloqueada', 'Não foi possível acionar, outra pessoa da equipe já acionou um serviço. Atualize a tela.');
      } else {
        const msg = error?.message || error?.code || JSON.stringify(error) || 'Verifique sua conexão.';
        Alert.alert('Erro', `Não foi possível atualizar o serviço: ${msg}`);
      }
    } finally {
      setUpdatingStatus(null);
    }
  }

  // Acionar — confirmação + update + verificação de regra de 1 por equipe
  async function handleAcionar() {
    setUpdatingStatus('acionar');
    try {
      const equipeAtual = user?.equipe;
      
      if (equipeAtual) {
        // Verifica se há outro serviço acionado para a mesma equipe
        const { data: ativos, error: erroBusca } = await supabase
          .from('servicos')
          .select('id, equip, desc, local')
          .eq('status', 'acionado')
          .filter('atribuido_para->>equipe', 'eq', equipeAtual);

        if (erroBusca) throw erroBusca;

        if (ativos && ativos.length > 0) {
          const servicoAtivo = ativos[0];
          // Ignora se for o próprio serviço (já acionado mas botão ativado por algum descompasso)
          if (servicoAtivo.id !== currentServico.id) {
            setUpdatingStatus(null);
            
            const identificador = servicoAtivo.id + (servicoAtivo.local ? ` (${servicoAtivo.local})` : '');
            
            Alert.alert(
              'Atenção',
              `Você está acionado no serviço ${identificador}. Deseja cancelar o acionamento atual e acionar o serviço ${currentServico.id} no lugar?`,
              [
                { text: 'Cancelar', style: 'cancel' },
                {
                  text: 'Trocar acionamento',
                  onPress: async () => {
                     setUpdatingStatus('acionar');
                     const { error: erroReverte } = await supabase
                       .from('servicos')
                       .update({ status: 'pendente' })
                       .eq('id', servicoAtivo.id);
                       
                     if (erroReverte) {
                       setUpdatingStatus(null);
                       Alert.alert('Erro', 'Não foi possível cancelar o acionamento anterior.');
                       return;
                     }
                     // Se cancelou com sucesso, aciona o atual
                     updateServicoStatus('acionado', 'acionar');
                  }
                }
              ]
            );
            return;
          }
        }
      }

      // Se não tem outro, ou não tem equipe, só pede confirmação padrão
      setUpdatingStatus(null);
      Alert.alert(
        'Acionar Serviço',
        `Deseja acionar a OS #${currentServico.id}?`,
        [
          { text: 'Cancelar', style: 'cancel' },
          {
            text: 'Acionar',
            onPress: () => updateServicoStatus('acionado', 'acionar'),
          },
        ]
      );
    } catch (err) {
      console.error(err);
      setUpdatingStatus(null);
      Alert.alert('Erro', 'Erro ao verificar serviços acionados.');
    }
  }

  // Iniciar Execução — atualiza status e navega diretamente para a tela de fotos
  function handleIniciarExecucao() {
    Alert.alert(
      'Iniciar Execução',
      `Deseja iniciar a execução da OS #${currentServico.id}?\nVocê será direcionado para registrar as fotos.`,
      [
        { text: 'Cancelar', style: 'cancel' },
        {
          text: 'Iniciar',
          onPress: async () => {
            setUpdatingStatus('execucao');
            try {
              const { error } = await supabase
                .from('servicos')
                .update({ status: 'em_execucao' })
                .eq('id', currentServico.id);

              if (error) throw error;

              const servicoAtualizado = { ...currentServico, status: 'em_execucao' };
              setCurrentServico(servicoAtualizado);
              // Navega imediatamente para a tela de fotos
              navigation.navigate('Execucao', { servico: servicoAtualizado });
            } catch (err) {
              console.error(err);
              const msg = err?.message || err?.code || JSON.stringify(err) || 'Verifique sua conexão.';
              Alert.alert('Erro', `Não foi possível iniciar a execução: ${msg}`);
            } finally {
              setUpdatingStatus(null);
            }
          },
        },
      ]
    );
  }

  // Finalizar — navega para tela de conclusão (fotos + observação)
  function handleFinalizar() {
    navigation.navigate('Execucao', { servico: currentServico });
  }

  // Campos dinâmicos do banco
  const ignoreKeys = ['id', 'hist', 'execucao', 'fotoAntes', 'fotoDepois', 'status', 'tecnico_uid', 'created_at'];
  const dynamicKeys = Object.keys(currentServico).filter(
    (key) =>
      !ignoreKeys.includes(key) &&
      currentServico[key] !== null &&
      currentServico[key] !== '' &&
      typeof currentServico[key] !== 'object'
  );

  const isUpdating = updatingStatus !== null;

  // Debug: log do status recebido
  // console.log('[DetalheServico] status:', currentServico.status, '| id:', currentServico.id);

  return (
    <SafeAreaView style={styles.container} edges={['bottom', 'left', 'right']}>
      {isOffline && (
        <View style={styles.offlineBanner}>
          <Text style={styles.offlineText}>⚠️ Você está offline</Text>
        </View>
      )}

      {/* View com flex:1 garante que o footer fixo não sai da tela no web */}
      <View style={styles.scrollWrapper}>
        <ScrollView contentContainerStyle={styles.scrollContent}>
          {/* Card Principal */}
          <View style={styles.card}>
            <View style={styles.headerRow}>
              <Text style={styles.idText}>OS #{currentServico.id}</Text>
              <View style={[styles.badge, { backgroundColor: statusInfo.bg, borderColor: statusInfo.border }]}>
                <Text style={[styles.badgeText, { color: statusInfo.color }]}>{statusInfo.label}</Text>
              </View>
            </View>

            {/* Descrição em destaque se existir */}
            {!!currentServico.desc && (
              <View style={styles.descBox}>
                <Text style={styles.descLabel}>DESCRIÇÃO DO SERVIÇO</Text>
                <Text style={styles.descText}>{currentServico.desc}</Text>
              </View>
            )}

            {/* Equipamento em destaque se existir */}
            {!!currentServico.equip && (
              <View style={styles.equipBox}>
                <Text style={styles.equipLabel}>🔧 Equipamento</Text>
                <Text style={styles.equipValue}>{currentServico.equip}</Text>
              </View>
            )}

            {/* Loop dinâmico dos demais campos */}
            {dynamicKeys
              .filter((k) => k !== 'desc' && k !== 'equip')
              .map((key) => {
                let labelFormatted = key.replace(/([A-Z])/g, ' $1').trim();
                let val = currentServico[key];
                if (key.includes('dt') || key.includes('data')) {
                  val = formatDate(val);
                }
                return <LabelValue key={key} label={labelFormatted} value={val} />;
              })}
          </View>

          {/* Coordenadas / Mapa */}
          {!!currentServico.coord && (
            <View style={styles.card}>
              <LabelValue label="Coordenadas GPS" value={currentServico.coord} />
              <TouchableOpacity style={styles.actionBtnOutline} onPress={openMaps}>
                <Text style={styles.actionBtnOutlineText}>📍 Abrir no Google Maps</Text>
              </TouchableOpacity>
            </View>
          )}

          {/* Foto do Reparo */}
          <View style={styles.card}>
            <Text style={styles.sectionLabel}>FOTO DO REPARO</Text>
            {!currentServico.foto ? (
              <View style={styles.placeholderBox}>
                <Text style={styles.placeholderText}>Sem foto anexada</Text>
              </View>
            ) : currentServico.foto.includes('supabase.co/storage') ? (
              <TouchableOpacity onPress={openFoto} activeOpacity={0.8}>
                {!imageError ? (
                  <Image 
                    source={{ uri: currentServico.foto }} 
                    style={styles.inlineImage} 
                    onError={() => setImageError(true)}
                  />
                ) : (
                  <View style={styles.fallbackBox}>
                    <Text style={styles.fallbackIcon}>⚠️</Text>
                    <Text style={styles.fallbackText}>Não foi possível carregar a imagem.</Text>
                    <Text style={styles.fallbackLink}>Toque aqui para abrir no navegador</Text>
                  </View>
                )}
              </TouchableOpacity>
            ) : (
              <TouchableOpacity style={styles.actionBtnOutline} onPress={openFoto}>
                <Text style={styles.actionBtnOutlineText}>📷 Ver Foto (Link Externo)</Text>
              </TouchableOpacity>
            )}
          </View>
        </ScrollView>
      </View>

      {/* Rodapé Fixo — Ações */}
      {['cadastrado', 'pendente', 'acionado', 'em_execucao'].includes(currentServico.status) && (
        <View style={styles.footer}>
          {/* CADASTRADO ou PENDENTE → botão Acionar */}
          {['cadastrado', 'pendente'].includes(currentServico.status) && (
            <TouchableOpacity
              style={[styles.btn, { backgroundColor: CORES.primario }, isUpdating && styles.btnDisabled]}
              onPress={handleAcionar}
              disabled={isUpdating}
            >
              {updatingStatus === 'acionar' ? (
                <ActivityIndicator color="#fff" />
              ) : (
                <>
                  <Text style={styles.btnIcon}>⚡</Text>
                  <Text style={styles.btnText}>Acionar Serviço</Text>
                </>
              )}
            </TouchableOpacity>
          )}

          {/* ACIONADO → botão Iniciar Execução + Cancelar Acionamento */}
          {currentServico.status === 'acionado' && (
            <View style={{ gap: 10, width: '100%' }}>
              <TouchableOpacity
                style={[styles.btn, { backgroundColor: CORES.azulAcao }, isUpdating && styles.btnDisabled]}
                onPress={handleIniciarExecucao}
                disabled={isUpdating}
              >
                {updatingStatus === 'execucao' ? (
                  <ActivityIndicator color="#fff" />
                ) : (
                  <>
                    <Text style={styles.btnIcon}>▶️</Text>
                    <Text style={styles.btnText}>Iniciar Execução</Text>
                  </>
                )}
              </TouchableOpacity>

              <TouchableOpacity
                style={[styles.btn, { backgroundColor: '#ef4444' }, isUpdating && styles.btnDisabled]}
                onPress={() => {
                   Alert.alert(
                     'Cancelar Acionamento',
                     'Deseja cancelar o acionamento deste serviço?',
                     [
                       { text: 'Não', style: 'cancel' },
                       { text: 'Sim', onPress: () => updateServicoStatus('pendente', 'cancelar') }
                     ]
                   );
                }}
                disabled={isUpdating}
              >
                {updatingStatus === 'cancelar' ? (
                  <ActivityIndicator color="#fff" />
                ) : (
                  <>
                    <Text style={styles.btnIcon}>🛑</Text>
                    <Text style={styles.btnText}>Cancelar Acionamento</Text>
                  </>
                )}
              </TouchableOpacity>
            </View>
          )}

          {/* EM EXECUÇÃO → botão Finalizar Serviço + Cancelar Execução */}
          {currentServico.status === 'em_execucao' && (
            <View style={{ gap: 10, width: '100%' }}>
              <TouchableOpacity
                style={[styles.btn, { backgroundColor: CORES.primario }, isUpdating && styles.btnDisabled]}
                onPress={handleFinalizar}
                disabled={isUpdating}
              >
                <Text style={styles.btnIcon}>✅</Text>
                <Text style={styles.btnText}>Finalizar Serviço</Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={[styles.btn, { backgroundColor: '#ef4444' }, isUpdating && styles.btnDisabled]}
                onPress={() => {
                  Alert.alert(
                    'Cancelar Execução',
                    `Tem certeza que deseja cancelar a execução da OS #${currentServico.id}?\nVocê poderá acioná-la novamente depois.`,
                    [
                      { text: 'Não', style: 'cancel' },
                      { text: 'Sim, cancelar', style: 'destructive', onPress: () => updateServicoStatus('acionado', 'cancelar_exec') },
                    ]
                  );
                }}
                disabled={isUpdating}
              >
                {updatingStatus === 'cancelar_exec' ? (
                  <ActivityIndicator color="#fff" />
                ) : (
                  <>
                    <Text style={styles.btnIcon}>🛑</Text>
                    <Text style={styles.btnText}>Cancelar Execução</Text>
                  </>
                )}
              </TouchableOpacity>
            </View>
          )}
        </View>
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: CORES.bgGlobal,
  },
  offlineBanner: {
    backgroundColor: CORES.erroBg,
    paddingVertical: 8,
    alignItems: 'center',
    justifyContent: 'center',
  },
  offlineText: {
    color: CORES.erro,
    fontSize: 13,
    fontWeight: '700',
  },
  scrollWrapper: {
    flex: 1,
  },
  scrollContent: {
    padding: 16,
    paddingBottom: 40,
  },
  card: {
    backgroundColor: CORES.bgCard,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: CORES.bordaPadrao,
    padding: 16,
    marginBottom: 16,
  },
  headerRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 16,
    borderBottomWidth: 1,
    borderBottomColor: CORES.bordaPadrao,
    paddingBottom: 12,
  },
  idText: {
    fontSize: 16,
    fontWeight: '600',
    color: CORES.textoPrincipal,
  },
  badge: {
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 8,
    borderWidth: 1,
  },
  badgeText: {
    fontSize: 12,
    fontWeight: '700',
    textTransform: 'uppercase',
  },
  // Descrição em destaque
  descBox: {
    backgroundColor: '#f8fafc',
    borderRadius: 8,
    padding: 12,
    marginBottom: 14,
    borderLeftWidth: 3,
    borderLeftColor: CORES.azulAcao,
  },
  descLabel: {
    fontSize: 9,
    fontWeight: '700',
    color: CORES.azulAcao,
    letterSpacing: 0.5,
    marginBottom: 4,
  },
  descText: {
    fontSize: 14,
    color: CORES.textoPrincipal,
    lineHeight: 20,
    fontWeight: '400',
  },
  // Equipamento em destaque
  equipBox: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#eff6ff',
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 10,
    marginBottom: 14,
    gap: 8,
    borderWidth: 1,
    borderColor: '#bfdbfe',
  },
  equipLabel: {
    fontSize: 13,
    fontWeight: '600',
    color: '#1d4ed8',
  },
  equipValue: {
    fontSize: 15,
    fontWeight: '700',
    color: '#1e40af',
  },
  field: { marginBottom: 12 },
  label: {
    fontSize: 10,
    fontWeight: '700',
    color: CORES.textoMuted,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    marginBottom: 2,
  },
  value: {
    fontSize: 14,
    color: CORES.textoPrincipal,
    fontWeight: '500',
  },
  actionBtnOutline: {
    borderWidth: 1,
    borderColor: CORES.azulAcao,
    borderRadius: 8,
    paddingVertical: 10,
    alignItems: 'center',
    marginTop: 8,
  },
  actionBtnOutlineText: {
    color: CORES.azulAcao,
    fontSize: 14,
    fontWeight: '600',
  },
  sectionLabel: {
    fontSize: 10,
    fontWeight: '700',
    color: CORES.textoMuted,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    marginBottom: 8,
  },
  placeholderBox: {
    paddingVertical: 20,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#f8fafc',
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#e2e8f0',
    borderStyle: 'dashed',
  },
  placeholderText: {
    color: CORES.textoMuted,
    fontSize: 13,
    fontWeight: '500',
  },
  inlineImage: {
    width: '100%',
    height: 200,
    borderRadius: 8,
    backgroundColor: '#e2e8f0',
    marginTop: 4,
  },
  fallbackBox: {
    backgroundColor: '#fffbeb',
    borderWidth: 1,
    borderColor: '#fde68a',
    borderRadius: 8,
    padding: 16,
    alignItems: 'center',
    marginTop: 4,
  },
  fallbackIcon: {
    fontSize: 24,
    marginBottom: 8,
  },
  fallbackText: {
    color: '#92400e',
    fontSize: 14,
    fontWeight: '600',
    textAlign: 'center',
    marginBottom: 4,
  },
  fallbackLink: {
    color: '#d97706',
    fontSize: 13,
    textDecorationLine: 'underline',
  },
  // Footer / Botões de Ação
  footer: {
    backgroundColor: CORES.bgCard,
    padding: 16,
    borderTopWidth: 1,
    borderTopColor: CORES.bordaPadrao,
  },
  btn: {
    borderRadius: 10,
    paddingVertical: 15,
    alignItems: 'center',
    justifyContent: 'center',
    flexDirection: 'row',
    gap: 8,
  },
  btnDisabled: {
    opacity: 0.6,
  },
  btnIcon: {
    fontSize: 18,
  },
  btnText: {
    color: '#ffffff',
    fontSize: 16,
    fontWeight: '700',
  },
});