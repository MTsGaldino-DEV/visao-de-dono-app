import React, { useEffect, useState, useLayoutEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  TouchableOpacity,
  ActivityIndicator,
  Platform,
  TextInput,
  ScrollView,
  Modal,
  useWindowDimensions,
} from 'react-native';
import { TabView, SceneMap, TabBar } from 'react-native-tab-view';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useNavigation } from '@react-navigation/native';
import { Ionicons } from '@expo/vector-icons';

import { supabase } from '../lib/supabase';
import { useAuth } from '../context/AuthContext';
import { CORES } from '../constants/CORES';
import { STATUS_CONFIG } from '../constants/STATUS_CONFIG';

// Novo: ação ao pressionar "+"
const NOVO_OPCOES = [
  { key: 'levantamento', label: 'Levantamento de Campo', icon: 'clipboard-outline', desc: 'Registrar necessidade identificada em campo' },
];

// Arrays de opções para o filtro
const OPCOES_STATUS = [
  { value: 'cadastrado', label: 'Cadastrado' },
  { value: 'pendente', label: 'Pendente' },
  { value: 'acionado', label: 'Acionado' },
  { value: 'em_execucao', label: 'Em Execução' },
  { value: 'concluido', label: 'Concluído' },
];

const OPCOES_TIPOS = ['NSIS', 'NSMP', 'RC02', 'INBE', 'NSCP'];

export default function ListaServicosScreen() {
  const navigation = useNavigation();
  const { user, signOut } = useAuth();
  
  const layout = useWindowDimensions();
  const [index, setIndex] = useState(0);
  const [routes] = useState([
    { key: 'pendentes', title: 'Pendentes' },
    { key: 'reprovados', title: 'Reprovados' },
    { key: 'executados', title: 'Executados' },
  ]);

  const [servicos, setServicos] = useState([]);
  const [loading, setLoading] = useState(true);
  const [resumoSemanal, setResumoSemanal] = useState({ concluidas: 0, reprovadas: 0 });

  // Contagem de levantamentos pendentes
  const [levantamentosPendentes, setLevantamentosPendentes] = useState(0);

  // Modal de Novo
  const [showNovoModal, setShowNovoModal] = useState(false);

  // Estados de Busca e Filtro
  const [searchText, setSearchText] = useState('');
  const [modalFiltroVisible, setModalFiltroVisible] = useState(false);

  // Filtros ativos aplicados na lista
  const [filtrosStatus, setFiltrosStatus] = useState([]);
  const [filtrosTipo, setFiltrosTipo] = useState([]);

  // Estados temporários do modal (para aplicar só ao clicar em "Aplicar")
  const [tempFiltrosStatus, setTempFiltrosStatus] = useState([]);
  const [tempFiltrosTipo, setTempFiltrosTipo] = useState([]);

  useLayoutEffect(() => {
    navigation.setOptions({ headerShown: false });
  }, [navigation]);

  useEffect(() => {
    if (user?.matricula) {
      fetchServicos();
      fetchResumoSemanal();
      fetchLevantamentosPendentes();
    }
  }, [user]);

  useEffect(() => {
    if (!user?.matricula) return;
    const channel = supabase
      .channel('servicos_changes')
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'servicos' },
        () => { 
          fetchServicos();
          fetchResumoSemanal();
        }
      )
      .subscribe();

    const channelLevantamentos = supabase
      .channel('levantamentos_changes_lista')
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'levantamentos' },
        () => fetchLevantamentosPendentes()
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
      supabase.removeChannel(channelLevantamentos);
    };
  }, [user]);

  async function fetchResumoSemanal() {
    if (!user?.matricula) return;
    try {
      const { data, error } = await supabase.rpc('obter_resumo_semanal', {
        matricula_param: user.matricula,
      });
      if (error) {
        console.error('Erro ao buscar resumo da semana:', error);
      } else if (data) {
        setResumoSemanal({
          concluidas: data.concluidas || 0,
          reprovadas: data.reprovadas || 0,
        });
      }
    } catch (err) {
      console.error(err);
    }
  }

  async function fetchLevantamentosPendentes() {
    if (!user?.matricula) return;
    try {
      const { data, error } = await supabase
        .from('levantamentos')
        .select('id')
        .eq('matricula_autor', user.matricula)
        .eq('status', 'pendente');
      if (!error && data) {
        setLevantamentosPendentes(data.length);
      }
    } catch (err) {
      console.error(err);
    }
  }

  async function fetchServicos() {
    try {
      setLoading(true);
      const { data, error } = await supabase
        .from('servicos')
        .select('*')
        .filter('atribuido_para->>matricula', 'eq', user?.matricula)
        .not('status', 'in', '("cancelado","reprovado")')
        .order('dtCadastro', { ascending: false });

      if (error) {
        console.error('Erro ao buscar serviços:', error);
      } else {
        setServicos(data || []);
      }
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  }

  // Lógica de saudação
  const getSaudacao = () => {
    const hora = new Date().getHours();
    if (hora < 12) return 'Bom dia';
    if (hora < 18) return 'Boa tarde';
    return 'Boa noite';
  };
  const primeiroNome = user?.label ? user.label.split(' ')[0] : 'Usuário';

  // --- Lógica de Filtros e Busca Local ---
  const servicosAtivos = servicos;

  const filterBySearchAndChips = (s) => {
    // Filtro de Texto
    const searchLower = searchText.toLowerCase();
    const idStr = String(s.id || '').toLowerCase();
    const descStr = String(s.descricao || s.desc || '').toLowerCase();
    const equipStr = String(s.equipamento || s.equip || '').toLowerCase();

    const matchesSearch = !searchText || 
                          idStr.includes(searchLower) || 
                          descStr.includes(searchLower) || 
                          equipStr.includes(searchLower);

    // Filtros de Categoria (Status / Tipo)
    const matchesStatus = filtrosStatus.length === 0 || filtrosStatus.includes(s.status);
    const matchesTipo = filtrosTipo.length === 0 || filtrosTipo.includes(s.tipo);

    return matchesSearch && matchesStatus && matchesTipo;
  };

  const pendentesList = servicos.filter(s => 
    ['cadastrado', 'pendente', 'acionado', 'em_execucao'].includes(s.status) && filterBySearchAndChips(s)
  );

  const reprovadosList = servicos.filter(s => 
    s.status === 'concluido' && s.aprovacaoEspacador === 'reprovado' && filterBySearchAndChips(s)
  );

  const executadosList = servicos.filter(s => 
    s.status === 'concluido' && (!s.aprovacaoEspacador || s.aprovacaoEspacador === 'aprovado') && filterBySearchAndChips(s)
  );

  const totalFiltrosAtivos = filtrosStatus.length + filtrosTipo.length;
  const countReprovados = servicos.filter(s => s.status === 'concluido' && s.aprovacaoEspacador === 'reprovado').length;

  // Abrir Modal
  const openModal = () => {
    setTempFiltrosStatus([...filtrosStatus]);
    setTempFiltrosTipo([...filtrosTipo]);
    setModalFiltroVisible(true);
  };

  // Funções do Modal
  const toggleTempStatus = (statusValue) => {
    setTempFiltrosStatus(prev => 
      prev.includes(statusValue) ? prev.filter(s => s !== statusValue) : [...prev, statusValue]
    );
  };

  const toggleTempTipo = (tipoValue) => {
    setTempFiltrosTipo(prev => 
      prev.includes(tipoValue) ? prev.filter(t => t !== tipoValue) : [...prev, tipoValue]
    );
  };

  const clearTempFilters = () => {
    setTempFiltrosStatus([]);
    setTempFiltrosTipo([]);
  };

  const applyFilters = () => {
    setFiltrosStatus(tempFiltrosStatus);
    setFiltrosTipo(tempFiltrosTipo);
    setModalFiltroVisible(false);
  };

  const removeStatusFilter = (statusValue) => {
    setFiltrosStatus(prev => prev.filter(s => s !== statusValue));
  };

  const removeTipoFilter = (tipoValue) => {
    setFiltrosTipo(prev => prev.filter(t => t !== tipoValue));
  };

  const getStatusLabel = (val) => OPCOES_STATUS.find(o => o.value === val)?.label || val;

  const renderHeader = () => (
    <View style={styles.headerContainer}>
      <View style={styles.cabecalhoLinha1}>
        <View style={styles.logoGroup}>
          <View style={styles.logoIconBg}>
            <Ionicons name="flash" size={16} color="#ffffff" />
          </View>
          <Text style={styles.logoText}>Visão de Dono</Text>
        </View>
        <View style={styles.headerIcons}>
          <TouchableOpacity>
            <Ionicons name="notifications-outline" size={20} color={CORES.textoSecundario} style={styles.iconMargin} />
          </TouchableOpacity>
          <TouchableOpacity onPress={signOut}>
            <Ionicons name="log-out-outline" size={22} color={CORES.erro} />
          </TouchableOpacity>
        </View>
      </View>

      <Text style={styles.saudacao}>{getSaudacao()}, {primeiroNome}</Text>

      <Text style={styles.sectionTitle}>Resumo da semana</Text>
      <View style={styles.resumoGrid}>
        <View style={styles.resumoCard}>
          <Text style={styles.resumoLabel}>Concluídas</Text>
          <Text style={[styles.resumoValor, { color: CORES.textoPrincipal }]}>{resumoSemanal.concluidas}</Text>
        </View>
        <View style={styles.resumoCard}>
          <Text style={styles.resumoLabel}>Reprovadas</Text>
          <Text style={[styles.resumoValor, { color: CORES.erro }]}>{resumoSemanal.reprovadas}</Text>
        </View>
      </View>

      <View style={styles.ordensHeader}>
        <Text style={styles.sectionTitleMinhasOrdens}>Minhas ordens</Text>
        <Text style={styles.ordensCount}>{servicosAtivos.length} atribuídas</Text>
      </View>

      <View style={styles.searchRow}>
        <View style={styles.searchInputContainer}>
          <Ionicons name="search" size={16} color={CORES.textoMuted} />
          <TextInput
            style={styles.searchInput}
            placeholder="Buscar por OS, equipamento..."
            placeholderTextColor={CORES.textoMuted}
            value={searchText}
            onChangeText={setSearchText}
          />
        </View>
        <TouchableOpacity style={styles.filterButton} onPress={openModal}>
          <Ionicons name="options" size={18} color={CORES.primario} />
          {totalFiltrosAtivos > 0 && (
            <View style={styles.filterBadge}>
              <Text style={styles.filterBadgeText}>{totalFiltrosAtivos}</Text>
            </View>
          )}
        </TouchableOpacity>
      </View>

      {/* Chips Ativos */}
      {totalFiltrosAtivos > 0 && (
        <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.chipsContainer}>
          {filtrosStatus.map(statusVal => (
            <TouchableOpacity key={`s-${statusVal}`} style={styles.chip} onPress={() => removeStatusFilter(statusVal)}>
              <Text style={styles.chipText}>Status: {getStatusLabel(statusVal)}</Text>
              <Ionicons name="close" size={11} color="#1d4ed8" style={styles.chipIcon} />
            </TouchableOpacity>
          ))}
          {filtrosTipo.map(tipoVal => (
            <TouchableOpacity key={`t-${tipoVal}`} style={styles.chip} onPress={() => removeTipoFilter(tipoVal)}>
              <Text style={styles.chipText}>Tipo: {tipoVal}</Text>
              <Ionicons name="close" size={11} color="#1d4ed8" style={styles.chipIcon} />
            </TouchableOpacity>
          ))}
        </ScrollView>
      )}
    </View>
  );

  const renderItem = ({ item }) => {
    const statusInfo = STATUS_CONFIG[item.status] || {
      color: CORES.textoSecundario,
      bg: '#f8fafc',
      border: CORES.bordaPadrao,
      label: item.status || 'Desconhecido',
    };

    const descricao = item.descricao || item.desc;
    const equipamento = item.equipamento || item.equip;
    const isReprovadoBackoffice = item.status === 'concluido' && item.aprovacaoEspacador === 'reprovado';

    return (
      <View style={styles.cardWrapper}>
        <TouchableOpacity
          style={styles.osCardVertical}
          activeOpacity={0.7}
          onPress={() => navigation.navigate('DetalheServico', { servico: item })}
        >
          <View style={styles.cardTopRow}>
            <Text style={styles.osIdAndType}>
              {item.id || 'Sem ID'} · {item.tipo || 'Serviço'}
            </Text>
            <View style={[styles.badge, { backgroundColor: statusInfo.bg, borderColor: statusInfo.border }]}>
              <Text style={[styles.badgeText, { color: statusInfo.color }]}>
                {statusInfo.label}
              </Text>
            </View>
          </View>

          <Text style={styles.osLocal} numberOfLines={1}>
            {item.local || 'Local não informado'}
          </Text>

          {!!descricao && (
            <Text style={styles.osDesc} numberOfLines={2}>
              {descricao}
            </Text>
          )}

          {!!equipamento && (
            <View style={styles.equipRow}>
              <Ionicons name="hardware-chip-outline" size={13} color={CORES.textoMuted} />
              <Text style={styles.osEquipText}>
                Equipamento nº {equipamento}
              </Text>
            </View>
          )}

          {/* Destaque para motivo de reprovação se for da aba de Reprovados */}
          {isReprovadoBackoffice && item.motivoReprovacaoEspacador && (
            <View style={styles.reprovacaoBox}>
              <Text style={styles.reprovacaoLabel}>MOTIVO DA REPROVAÇÃO:</Text>
              <Text style={styles.reprovacaoTexto}>{item.motivoReprovacaoEspacador}</Text>
            </View>
          )}
        </TouchableOpacity>
      </View>
    );
  };

  const renderScene = SceneMap({
    pendentes: () => (
      <FlatList
        style={{ flex: 1 }}
        data={pendentesList}
        keyExtractor={(item) => String(item.id)}
        renderItem={renderItem}
        contentContainerStyle={styles.listContent}
        showsVerticalScrollIndicator={false}
        ListEmptyComponent={() => (
          <View style={styles.emptyContainer}>
            <Text style={styles.emptyText}>Nenhuma OS pendente.</Text>
          </View>
        )}
      />
    ),
    reprovados: () => (
      <FlatList
        style={{ flex: 1 }}
        data={reprovadosList}
        keyExtractor={(item) => String(item.id)}
        renderItem={renderItem}
        contentContainerStyle={styles.listContent}
        showsVerticalScrollIndicator={false}
        ListEmptyComponent={() => (
          <View style={styles.emptyContainer}>
            <Text style={styles.emptyText}>Nenhuma OS reprovada.</Text>
          </View>
        )}
      />
    ),
    executados: () => (
      <FlatList
        style={{ flex: 1 }}
        data={executadosList}
        keyExtractor={(item) => String(item.id)}
        renderItem={renderItem}
        contentContainerStyle={styles.listContent}
        showsVerticalScrollIndicator={false}
        ListEmptyComponent={() => (
          <View style={styles.emptyContainer}>
            <Text style={styles.emptyText}>Nenhuma OS executada.</Text>
          </View>
        )}
      />
    ),
  });

  const renderTabBar = (props) => (
    <TabBar
      {...props}
      indicatorStyle={{ backgroundColor: CORES.primario, height: 3, borderRadius: 3 }}
      style={{ backgroundColor: CORES.bgGlobal, elevation: 0, shadowOpacity: 0, borderBottomWidth: 1, borderBottomColor: CORES.bordaPadrao }}
      activeColor={CORES.primario}
      inactiveColor={CORES.textoSecundario}
      renderLabel={({ route, focused, color }) => {
        const isReprovados = route.key === 'reprovados';
        return (
          <View style={styles.tabLabelContainer}>
            <Text style={[styles.tabLabelText, { color, fontWeight: focused ? '700' : '500' }]}>
              {route.title}
            </Text>
            {isReprovados && countReprovados > 0 && (
              <View style={styles.badgeCount}>
                <Text style={styles.badgeCountText}>{countReprovados}</Text>
              </View>
            )}
          </View>
        );
      }}
    />
  );

  return (
    <SafeAreaView style={styles.safeArea} edges={['top']}>
      {renderHeader()}

      {loading && servicos.length === 0 ? (
        <View style={styles.centerContainer}>
          <ActivityIndicator size="large" color={CORES.primario} />
        </View>
      ) : (
        <TabView
          navigationState={{ index, routes }}
          renderScene={renderScene}
          renderTabBar={renderTabBar}
          onIndexChange={setIndex}
          initialLayout={{ width: layout.width }}
          swipeEnabled={true}
        />
      )}

      <View style={styles.tabBarContainer}>
        <TouchableOpacity style={styles.tabItem} activeOpacity={0.7}>
          <Ionicons name="list" size={22} color={CORES.azulAcao} />
          <Text style={[styles.tabLabel, { color: CORES.azulAcao }]}>Lista</Text>
        </TouchableOpacity>

        <TouchableOpacity style={styles.tabCenterButton} activeOpacity={0.8} onPress={() => setShowNovoModal(true)}>
          <View style={styles.tabCenterCircle}>
            <Ionicons name="add" size={26} color="#ffffff" />
          </View>
          <Text style={styles.tabCenterLabel}>Novo</Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={styles.tabItem}
          activeOpacity={0.7}
          onPress={() => navigation.navigate('MeusLevantamentos')}
        >
          <View style={{ position: 'relative' }}>
            <Ionicons name="clipboard-outline" size={22} color={CORES.textoSecundario} />
            {levantamentosPendentes > 0 && (
              <View style={styles.tabBadge}>
                <Text style={styles.tabBadgeText}>{levantamentosPendentes > 9 ? '9+' : levantamentosPendentes}</Text>
              </View>
            )}
          </View>
          <Text style={styles.tabLabel}>Levantamentos</Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={styles.tabItem}
          activeOpacity={0.7}
          onPress={() => navigation.navigate('MapaServicos')}
        >
          <Ionicons name="map-outline" size={22} color={CORES.textoSecundario} />
          <Text style={styles.tabLabel}>Mapa</Text>
        </TouchableOpacity>
      </View>

      <Modal
        visible={modalFiltroVisible}
        transparent
        animationType="slide"
        onRequestClose={() => setModalFiltroVisible(false)}
      >
        <View style={styles.modalOverlay}>
          <TouchableOpacity style={styles.modalBackdrop} onPress={() => setModalFiltroVisible(false)} />
          
          <View style={styles.bottomSheet}>
            <Text style={styles.sheetTitle}>Filtros</Text>
            
            <Text style={styles.sheetSubtitle}>Status</Text>
            <View style={styles.sheetChipGroup}>
              {OPCOES_STATUS.map(op => {
                const isActive = tempFiltrosStatus.includes(op.value);
                return (
                  <TouchableOpacity 
                    key={op.value}
                    style={[styles.sheetChip, isActive && styles.sheetChipActive]}
                    onPress={() => toggleTempStatus(op.value)}
                  >
                    <Text style={isActive ? styles.sheetChipTextActive : styles.sheetChipText}>
                      {op.label}
                    </Text>
                  </TouchableOpacity>
                );
              })}
            </View>

            <Text style={styles.sheetSubtitle}>Tipo de serviço</Text>
            <View style={styles.sheetChipGroup}>
              {OPCOES_TIPOS.map(tipo => {
                const isActive = tempFiltrosTipo.includes(tipo);
                return (
                  <TouchableOpacity 
                    key={tipo}
                    style={[styles.sheetChip, isActive && styles.sheetChipActive]}
                    onPress={() => toggleTempTipo(tipo)}
                  >
                    <Text style={isActive ? styles.sheetChipTextActive : styles.sheetChipText}>
                      {tipo}
                    </Text>
                  </TouchableOpacity>
                );
              })}
            </View>

            <View style={styles.sheetActions}>
              <TouchableOpacity onPress={clearTempFilters}>
                <Text style={styles.sheetClearText}>Limpar filtros</Text>
              </TouchableOpacity>
              <TouchableOpacity style={styles.sheetApplyButton} onPress={applyFilters}>
                <Text style={styles.sheetApplyText}>Aplicar</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      {/* Modal: Opções de Novo */}
      <Modal
        visible={showNovoModal}
        transparent
        animationType="slide"
        onRequestClose={() => setShowNovoModal(false)}
      >
        <View style={styles.modalOverlay}>
          <TouchableOpacity style={styles.modalBackdrop} onPress={() => setShowNovoModal(false)} />
          <View style={styles.bottomSheet}>
            <Text style={styles.sheetTitle}>Novo registro</Text>
            {NOVO_OPCOES.map((opcao) => (
              <TouchableOpacity
                key={opcao.key}
                style={styles.novoOpcaoBtn}
                onPress={() => {
                  setShowNovoModal(false);
                  if (opcao.key === 'levantamento') {
                    navigation.navigate('LevantamentoForm');
                  }
                }}
              >
                <View style={styles.novoOpcaoIconBox}>
                  <Ionicons name={opcao.icon} size={22} color={CORES.primario} />
                </View>
                <View style={styles.novoOpcaoTextos}>
                  <Text style={styles.novoOpcaoLabel}>{opcao.label}</Text>
                  <Text style={styles.novoOpcaoDesc}>{opcao.desc}</Text>
                </View>
                <Ionicons name="chevron-forward" size={18} color={CORES.textoMuted} />
              </TouchableOpacity>
            ))}
          </View>
        </View>
      </Modal>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: CORES.bgGlobal,
  },
  centerContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  emptyContainer: {
    padding: 20,
    alignItems: 'center',
  },
  emptyText: {
    color: CORES.textoSecundario,
    fontSize: 14,
  },
  listContent: {
    paddingHorizontal: 20,
    paddingTop: Platform.OS === 'android' ? 16 : 8,
    paddingBottom: 20,
  },
  headerContainer: {
    paddingHorizontal: 20,
    paddingTop: Platform.OS === 'android' ? 16 : 8,
    paddingBottom: 10,
  },
  // 1. Cabeçalho
  cabecalhoLinha1: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  logoGroup: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  logoIconBg: {
    width: 30,
    height: 30,
    borderRadius: 8,
    backgroundColor: CORES.primario,
    justifyContent: 'center',
    alignItems: 'center',
  },
  logoText: {
    fontSize: 14,
    fontWeight: '500',
    color: CORES.primario,
  },
  saudacao: {
    fontSize: 18,
    fontWeight: '500',
    color: CORES.textoPrincipal,
    marginTop: 16,
    marginBottom: 24,
  },
  // 2. Resumo da semana
  sectionTitle: {
    fontSize: 14,
    fontWeight: '500',
    color: CORES.textoPrincipal,
    marginBottom: 10,
  },
  resumoGrid: {
    flexDirection: 'row',
    gap: 10,
    marginBottom: 24,
  },
  resumoCard: {
    flex: 1,
    backgroundColor: CORES.bgCard,
    borderWidth: 1,
    borderColor: CORES.bordaPadrao,
    borderRadius: 14,
    padding: 16,
  },
  resumoLabel: {
    fontSize: 12,
    color: CORES.textoMuted,
    marginBottom: 4,
  },
  resumoValor: {
    fontSize: 22,
    fontWeight: '500',
  },
  // 3. Minhas ordens (Header)
  ordensHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 12,
  },
  sectionTitleMinhasOrdens: {
    fontSize: 14,
    fontWeight: '500',
    color: CORES.textoPrincipal,
  },
  ordensCount: {
    fontSize: 12,
    color: CORES.textoSecundario,
  },
  // 4.1 Busca e filtros
  searchRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 12,
  },
  headerIcons: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  iconMargin: {
    marginRight: 16,
  },
  searchInputContainer: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: CORES.bgInput,
    borderWidth: 1,
    borderColor: CORES.bordaPadrao,
    borderRadius: 10,
    paddingHorizontal: 10,
    paddingVertical: 8,
  },
  searchInput: {
    flex: 1,
    marginLeft: 8,
    fontSize: 14,
    color: CORES.textoPrincipal,
    outlineStyle: 'none', // evita borda de foco na web
  },
  filterButton: {
    width: 38,
    height: 38,
    backgroundColor: CORES.bgCard,
    borderWidth: 1,
    borderColor: CORES.bordaPadrao,
    borderRadius: 10,
    justifyContent: 'center',
    alignItems: 'center',
    position: 'relative',
  },
  filterBadge: {
    position: 'absolute',
    top: -4,
    right: -4,
    width: 14,
    height: 14,
    borderRadius: 7,
    backgroundColor: CORES.azulAcao,
    justifyContent: 'center',
    alignItems: 'center',
  },
  filterBadgeText: {
    color: '#ffffff',
    fontSize: 9,
    fontWeight: '700',
  },
  chipsContainer: {
    flexDirection: 'row',
    marginBottom: 16,
  },
  chip: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#eff6ff',
    borderWidth: 1,
    borderColor: '#bfdbfe',
    borderRadius: 999,
    paddingVertical: 4,
    paddingHorizontal: 10,
    marginRight: 8,
  },
  chipText: {
    fontSize: 11,
    fontWeight: '500',
    color: '#1d4ed8',
  },
  chipIcon: {
    marginLeft: 4,
  },
  // 4.3 Cards Verticais
  cardWrapper: {
    marginBottom: 10,
  },
  osCardVertical: {
    backgroundColor: CORES.bgCard,
    borderWidth: 1,
    borderColor: CORES.bordaPadrao,
    borderRadius: 14,
    paddingVertical: 14,
    paddingHorizontal: 16,
  },
  cardTopRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
  },
  osIdAndType: {
    fontSize: 14,
    fontWeight: '500',
    color: CORES.textoPrincipal,
  },
  badge: {
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 8,
    borderWidth: 1,
  },
  badgeText: {
    fontSize: 11,
    fontWeight: '500',
  },
  osLocal: {
    fontSize: 12,
    color: CORES.textoSecundario,
    marginTop: 4,
  },
  osDesc: {
    fontSize: 12,
    color: CORES.textoPrincipal,
    lineHeight: 16.8, 
    marginTop: 6,
  },
  equipRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 6,
  },
  osEquipText: {
    fontSize: 12,
    color: CORES.textoMuted,
    marginLeft: 4,
  },
  // 4. Navegação inferior (Tab Bar)
  tabBarContainer: {
    flexDirection: 'row',
    justifyContent: 'space-around',
    alignItems: 'flex-start',
    backgroundColor: CORES.bgCard,
    paddingTop: 16,
    borderTopWidth: 1,
    borderTopColor: CORES.bordaPadrao,
    paddingBottom: Platform.OS === 'ios' ? 24 : 16,
  },
  tabItem: {
    alignItems: 'center',
    width: 60,
  },
  tabLabel: {
    fontSize: 11,
    fontWeight: '500',
    marginTop: 4,
  },
  tabCenterButton: {
    alignItems: 'center',
    marginTop: -22,
  },
  tabCenterCircle: {
    width: 52,
    height: 52,
    borderRadius: 26,
    backgroundColor: CORES.primario,
    justifyContent: 'center',
    alignItems: 'center',
    shadowColor: CORES.primario,
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.35,
    shadowRadius: 6,
    elevation: 4,
  },
  tabCenterLabel: {
    fontSize: 11,
    color: CORES.textoSecundario,
    marginTop: 6,
  },
  tabBadge: {
    position: 'absolute',
    top: -5,
    right: -8,
    backgroundColor: CORES.erro,
    borderRadius: 8,
    minWidth: 16,
    height: 16,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 3,
    borderWidth: 1.5,
    borderColor: CORES.bgCard,
  },
  tabBadgeText: {
    color: '#fff',
    fontSize: 9,
    fontWeight: '700',
  },
  // Modal / Bottom Sheet
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
  sheetSubtitle: {
    fontSize: 13,
    fontWeight: '500',
    color: CORES.textoSecundario,
    marginBottom: 10,
    marginTop: 10,
  },
  sheetChipGroup: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    marginBottom: 10,
  },
  sheetChip: {
    paddingVertical: 6,
    paddingHorizontal: 12,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: CORES.bordaPadrao,
    backgroundColor: CORES.bgInput,
  },
  sheetChipActive: {
    borderColor: CORES.azulAcao,
    backgroundColor: '#eff6ff',
  },
  sheetChipText: {
    fontSize: 13,
    color: CORES.textoSecundario,
  },
  sheetChipTextActive: {
    fontSize: 13,
    fontWeight: '500',
    color: CORES.azulAcao,
  },
  sheetActions: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginTop: 30,
  },
  sheetClearText: {
    fontSize: 14,
    color: CORES.textoSecundario,
    fontWeight: '500',
  },
  sheetApplyButton: {
    backgroundColor: CORES.primario,
    paddingVertical: 12,
    paddingHorizontal: 24,
    borderRadius: 10,
  },
  sheetApplyText: {
    color: '#ffffff',
    fontSize: 14,
    fontWeight: '500',
  },
  tabLabelContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    position: 'relative',
    paddingHorizontal: 4,
  },
  tabLabelText: {
    fontSize: 13,
    textTransform: 'uppercase',
  },
  badgeCount: {
    position: 'absolute',
    top: -8,
    right: -10,
    backgroundColor: '#ef4444',
    minWidth: 18,
    height: 18,
    borderRadius: 9,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 4,
  },
  badgeCountText: {
    color: '#fff',
    fontSize: 10,
    fontWeight: '700',
  },
  reprovacaoBox: {
    marginTop: 10,
    backgroundColor: '#ffedd5',
    borderLeftWidth: 3,
    borderLeftColor: '#f97316',
    padding: 10,
    borderRadius: 6,
  },
  reprovacaoLabel: {
    fontSize: 10,
    fontWeight: '700',
    color: '#c2410c',
    marginBottom: 4,
  },
  reprovacaoTexto: {
    fontSize: 12,
    color: '#9a3412',
    lineHeight: 16,
  },
  // Estilos do Modal "Novo"
  novoOpcaoBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
    paddingVertical: 14,
    borderBottomWidth: 1,
    borderBottomColor: CORES.bordaPadrao,
  },
  novoOpcaoIconBox: {
    width: 44,
    height: 44,
    borderRadius: 12,
    backgroundColor: '#f0f4ff',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: '#c7d2fe',
  },
  novoOpcaoTextos: { flex: 1 },
  novoOpcaoLabel: {
    fontSize: 15,
    fontWeight: '600',
    color: CORES.textoPrincipal,
    marginBottom: 2,
  },
  novoOpcaoDesc: {
    fontSize: 12,
    color: CORES.textoSecundario,
    lineHeight: 16,
  },
});
