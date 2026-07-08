import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  TouchableOpacity,
  ActivityIndicator,
  RefreshControl,
  Platform,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';

import { supabase } from '../lib/supabase';
import { useAuth } from '../context/AuthContext';
import { CORES } from '../constants/CORES';

// ── Configuração de badges por status ─────────────────────────────────────────
const STATUS_LEVANTAMENTO = {
  pendente: {
    label: 'Aguardando aprovação',
    color: '#b45309',
    bg: '#fef3c7',
    border: '#fcd34d',
    icon: 'time-outline',
  },
  aprovado: {
    label: 'Aprovado',
    color: '#15803d',
    bg: '#dcfce7',
    border: '#86efac',
    icon: 'checkmark-circle-outline',
  },
  reprovado: {
    label: 'Reprovado',
    color: '#dc2626',
    bg: '#fef2f2',
    border: '#fca5a5',
    icon: 'close-circle-outline',
  },
};

// ── Card de Levantamento ───────────────────────────────────────────────────────
function LevantamentoCard({ item }) {
  const statusInfo = STATUS_LEVANTAMENTO[item.status] || {
    label: item.status,
    color: CORES.textoSecundario,
    bg: '#f8fafc',
    border: CORES.bordaPadrao,
    icon: 'help-circle-outline',
  };

  const formatDate = (iso) => {
    if (!iso) return '';
    return new Date(iso).toLocaleDateString('pt-BR', {
      day: '2-digit', month: '2-digit', year: 'numeric',
      hour: '2-digit', minute: '2-digit',
    });
  };

  return (
    <View style={styles.card}>
      {/* Cabeçalho: ID + Status */}
      <View style={styles.cardHeader}>
        <View style={styles.cardIdGroup}>
          <Text style={styles.cardId}>#{item.id?.slice(0, 8).toUpperCase()}</Text>
          <Text style={styles.cardTipo}> · {item.tipo}</Text>
        </View>
        <View style={[styles.badge, { backgroundColor: statusInfo.bg, borderColor: statusInfo.border }]}>
          <Ionicons name={statusInfo.icon} size={12} color={statusInfo.color} />
          <Text style={[styles.badgeText, { color: statusInfo.color }]}>{statusInfo.label}</Text>
        </View>
      </View>

      {/* Local */}
      <View style={styles.rowInfo}>
        <Ionicons name="location-outline" size={13} color={CORES.textoMuted} />
        <Text style={styles.localText} numberOfLines={1}>{item.local || 'Local não informado'}</Text>
      </View>

      {/* Descrição */}
      {!!item.descricao && (
        <Text style={styles.descricao} numberOfLines={2}>{item.descricao}</Text>
      )}

      {/* Data */}
      <Text style={styles.dataText}>{formatDate(item.criado_em)}</Text>

      {/* Motivo de reprovação */}
      {item.status === 'reprovado' && !!item.motivo_reprovacao && (
        <View style={styles.reprovacaoBox}>
          <Text style={styles.reprovacaoLabel}>MOTIVO DA REPROVAÇÃO</Text>
          <Text style={styles.reprovacaoTexto}>{item.motivo_reprovacao}</Text>
        </View>
      )}

      {/* Serviço gerado (se aprovado) */}
      {item.status === 'aprovado' && !!item.servico_gerado_id && (
        <View style={styles.servicoGeradoBox}>
          <Ionicons name="checkmark-done-outline" size={14} color="#15803d" />
          <Text style={styles.servicoGeradoText}>
            Serviço gerado: <Text style={styles.servicoGeradoId}>{item.servico_gerado_id}</Text>
          </Text>
        </View>
      )}
    </View>
  );
}

// ── Tela Principal ─────────────────────────────────────────────────────────────
export default function MeusLevantamentosScreen() {
  const { user } = useAuth();
  const [levantamentos, setLevantamentos] = useState([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  // Filtro de aba interno
  const [abaAtiva, setAbaAtiva] = useState('todos');

  const fetchLevantamentos = async (isRefresh = false) => {
    if (isRefresh) setRefreshing(true);
    try {
      const { data, error } = await supabase
        .from('levantamentos')
        .select('*')
        .eq('matricula_autor', user.matricula)
        .order('criado_em', { ascending: false });

      if (error) {
        console.error('Erro ao buscar levantamentos:', error);
      } else {
        setLevantamentos(data || []);
      }
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  useEffect(() => {
    if (user?.matricula) {
      fetchLevantamentos();
    }
  }, [user]);

  // Realtime subscription
  useEffect(() => {
    if (!user?.matricula) return;
    const channel = supabase
      .channel('meus_levantamentos_changes')
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'levantamentos' },
        () => fetchLevantamentos()
      )
      .subscribe();

    return () => { supabase.removeChannel(channel); };
  }, [user]);

  // Filtragem
  const dadosFiltrados =
    abaAtiva === 'todos'
      ? levantamentos
      : levantamentos.filter((l) => l.status === abaAtiva);

  const countPendente = levantamentos.filter((l) => l.status === 'pendente').length;
  const countAprovado = levantamentos.filter((l) => l.status === 'aprovado').length;
  const countReprovado = levantamentos.filter((l) => l.status === 'reprovado').length;

  const ABAS = [
    { key: 'todos', label: 'Todos', count: levantamentos.length },
    { key: 'pendente', label: 'Aguardando', count: countPendente },
    { key: 'aprovado', label: 'Aprovados', count: countAprovado },
    { key: 'reprovado', label: 'Reprovados', count: countReprovado },
  ];

  return (
    <SafeAreaView style={styles.container} edges={['bottom', 'left', 'right']}>
      {/* Abas de filtro */}
      <View style={styles.abasContainer}>
        {ABAS.map((aba) => {
          const isActive = abaAtiva === aba.key;
          return (
            <TouchableOpacity
              key={aba.key}
              style={[styles.abaBtn, isActive && styles.abaBtnActive]}
              onPress={() => setAbaAtiva(aba.key)}
            >
              <Text style={[styles.abaText, isActive && styles.abaTextActive]}>
                {aba.label}
              </Text>
              {aba.count > 0 && (
                <View style={[styles.abaBadge, isActive && styles.abaBadgeActive]}>
                  <Text style={[styles.abaBadgeText, isActive && styles.abaBadgeTextActive]}>
                    {aba.count}
                  </Text>
                </View>
              )}
            </TouchableOpacity>
          );
        })}
      </View>

      {loading ? (
        <View style={styles.centerView}>
          <ActivityIndicator size="large" color={CORES.primario} />
        </View>
      ) : (
        <FlatList
          data={dadosFiltrados}
          keyExtractor={(item) => item.id}
          renderItem={({ item }) => <LevantamentoCard item={item} />}
          contentContainerStyle={styles.listContent}
          showsVerticalScrollIndicator={false}
          refreshControl={
            <RefreshControl
              refreshing={refreshing}
              onRefresh={() => fetchLevantamentos(true)}
              colors={[CORES.primario]}
              tintColor={CORES.primario}
            />
          }
          ListEmptyComponent={() => (
            <View style={styles.emptyContainer}>
              <Ionicons name="clipboard-outline" size={48} color={CORES.textoMuted} />
              <Text style={styles.emptyTitle}>Nenhum levantamento</Text>
              <Text style={styles.emptySubtitle}>
                {abaAtiva === 'todos'
                  ? 'Você ainda não enviou nenhum levantamento de campo.'
                  : `Nenhum levantamento com status "${ABAS.find((a) => a.key === abaAtiva)?.label}".`}
              </Text>
            </View>
          )}
        />
      )}
    </SafeAreaView>
  );
}

// ── Estilos ────────────────────────────────────────────────────────────────────
const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: CORES.bgGlobal },

  // Abas internas
  abasContainer: {
    flexDirection: 'row',
    backgroundColor: CORES.bgCard,
    borderBottomWidth: 1,
    borderBottomColor: CORES.bordaPadrao,
    paddingHorizontal: 16,
    paddingVertical: 10,
    gap: 8,
  },
  abaBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingVertical: 6,
    paddingHorizontal: 12,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: CORES.bordaPadrao,
    backgroundColor: CORES.bgInput,
  },
  abaBtnActive: {
    backgroundColor: CORES.primario,
    borderColor: CORES.primario,
  },
  abaText: { fontSize: 12, fontWeight: '600', color: CORES.textoSecundario },
  abaTextActive: { color: '#fff' },
  abaBadge: {
    backgroundColor: CORES.bordaPadrao,
    borderRadius: 10,
    minWidth: 18,
    height: 18,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 4,
  },
  abaBadgeActive: { backgroundColor: 'rgba(255,255,255,0.25)' },
  abaBadgeText: { fontSize: 10, fontWeight: '700', color: CORES.textoSecundario },
  abaBadgeTextActive: { color: '#fff' },

  // Lista
  listContent: { padding: 16, paddingBottom: 32 },
  centerView: { flex: 1, alignItems: 'center', justifyContent: 'center' },

  // Card
  card: {
    backgroundColor: CORES.bgCard,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: CORES.bordaPadrao,
    padding: 16,
    marginBottom: 12,
  },
  cardHeader: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    marginBottom: 8,
  },
  cardIdGroup: { flexDirection: 'row', alignItems: 'center', flex: 1 },
  cardId: { fontSize: 13, fontWeight: '700', color: CORES.textoPrincipal },
  cardTipo: { fontSize: 13, fontWeight: '500', color: CORES.textoSecundario },
  badge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 8,
    borderWidth: 1,
  },
  badgeText: { fontSize: 11, fontWeight: '600' },

  rowInfo: { flexDirection: 'row', alignItems: 'center', gap: 4, marginBottom: 6 },
  localText: { fontSize: 13, color: CORES.textoSecundario, flex: 1 },
  descricao: { fontSize: 13, color: CORES.textoPrincipal, lineHeight: 18, marginBottom: 6 },
  dataText: { fontSize: 11, color: CORES.textoMuted, marginTop: 4 },

  // Reprovação
  reprovacaoBox: {
    marginTop: 10,
    backgroundColor: '#ffedd5',
    borderLeftWidth: 3,
    borderLeftColor: '#f97316',
    padding: 10,
    borderRadius: 6,
  },
  reprovacaoLabel: {
    fontSize: 9,
    fontWeight: '700',
    color: '#c2410c',
    letterSpacing: 0.5,
    marginBottom: 4,
  },
  reprovacaoTexto: { fontSize: 13, color: '#9a3412', lineHeight: 18 },

  // Serviço gerado
  servicoGeradoBox: {
    marginTop: 10,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: '#dcfce7',
    borderRadius: 8,
    paddingHorizontal: 10,
    paddingVertical: 8,
    borderWidth: 1,
    borderColor: '#86efac',
  },
  servicoGeradoText: { fontSize: 12, color: '#15803d' },
  servicoGeradoId: { fontWeight: '700' },

  // Empty
  emptyContainer: { alignItems: 'center', paddingVertical: 60, paddingHorizontal: 24 },
  emptyTitle: { fontSize: 16, fontWeight: '600', color: CORES.textoPrincipal, marginTop: 12, marginBottom: 6 },
  emptySubtitle: { fontSize: 13, color: CORES.textoSecundario, textAlign: 'center', lineHeight: 18 },
});
