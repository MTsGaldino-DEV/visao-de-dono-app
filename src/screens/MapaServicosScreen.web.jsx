/**
 * MapaServicosScreen.web.jsx
 * Fallback para a plataforma Web — react-native-maps não suporta web.
 * O Metro Bundler carrega automaticamente este arquivo quando o target é web.
 */
import React, { useEffect, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ActivityIndicator,
  Alert,
  ScrollView,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useNavigation } from '@react-navigation/native';

import { supabase } from '../lib/supabase';
import { useAuth } from '../context/AuthContext';
import { CORES } from '../constants/CORES';
import { STATUS_CONFIG } from '../constants/STATUS_CONFIG';

export default function MapaServicosScreen() {
  const navigation = useNavigation();
  const { user } = useAuth();

  const [servicos, setServicos] = useState([]);
  const [loading, setLoading] = useState(true);
  const [updating, setUpdating] = useState(null);

  useEffect(() => {
    fetchServicos();
  }, []);

  async function fetchServicos() {
    try {
      setLoading(true);
      const { data, error } = await supabase
        .from('servicos')
        .select('*')
        .filter('atribuido_para->>matricula', 'eq', user.matricula)
        .neq('status', 'cancelado')
        .neq('status', 'reprovado')
        .neq('status', 'concluido')
        .order('dtCadastro', { ascending: false });

      if (!error) setServicos(data || []);
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  }

  async function handleAcionar(servico) {
    if (!window.confirm(`Deseja acionar a OS #${servico.id}?`)) return;
    setUpdating(servico.id);
    try {
      const { error } = await supabase
        .from('servicos')
        .update({ status: 'acionado' })
        .eq('id', servico.id);
      if (error) throw error;
      fetchServicos();
    } catch {
      alert('Não foi possível acionar o serviço.');
    } finally {
      setUpdating(null);
    }
  }

  function parseCoords(coordStr) {
    if (!coordStr) return null;
    const parts = coordStr.trim().split(/[\s,]+/);
    if (parts.length < 2) return null;
    const lat = parseFloat(parts[0]);
    const lng = parseFloat(parts[1]);
    if (isNaN(lat) || isNaN(lng)) return null;
    return { lat, lng };
  }

  return (
    <SafeAreaView style={styles.container} edges={['bottom', 'left', 'right']}>
      {/* Banner informativo web */}
      <View style={styles.webBanner}>
        <Text style={styles.webBannerIcon}>🗺️</Text>
        <Text style={styles.webBannerText}>
          O mapa interativo está disponível apenas no app mobile.{' '}
          Aqui você pode visualizar e acionar as OS com GPS cadastrado.
        </Text>
      </View>

      {loading ? (
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color={CORES.primario} />
          <Text style={styles.loadingText}>Carregando serviços...</Text>
        </View>
      ) : (
        <ScrollView contentContainerStyle={styles.scrollContent}>
          {servicos.length === 0 ? (
            <View style={styles.emptyContainer}>
              <Text style={styles.emptyIcon}>📋</Text>
              <Text style={styles.emptyText}>Nenhum serviço ativo atribuído</Text>
            </View>
          ) : (
            <>
              <Text style={styles.sectionTitle}>
                {servicos.length} {servicos.length === 1 ? 'serviço ativo' : 'serviços ativos'}
              </Text>
              {servicos.map((servico) => {
                const statusInfo = STATUS_CONFIG[servico.status] || {
                  bg: '#f8fafc', color: '#64748b', border: '#e2e8f0', label: servico.status,
                };
                const coords = parseCoords(servico.coord);

                return (
                  <View key={servico.id} style={styles.card}>
                    {/* Barra colorida de status */}
                    <View style={[styles.cardAccent, { backgroundColor: statusInfo.color }]} />

                    <View style={styles.cardBody}>
                      <View style={styles.cardHeader}>
                        <Text style={styles.cardId}>OS #{servico.id}</Text>
                        <View style={[styles.badge, { backgroundColor: statusInfo.bg, borderColor: statusInfo.border }]}>
                          <Text style={[styles.badgeText, { color: statusInfo.color }]}>
                            {statusInfo.label}
                          </Text>
                        </View>
                      </View>

                      {!!servico.local && (
                        <Text style={styles.cardLocal}>📍 {servico.local}</Text>
                      )}
                      {/* Tipo de serviço */}
                      {!!servico.tipo && (
                        <Text style={styles.cardTipo}>{servico.tipo}</Text>
                      )}
                      {/* Equipamento */}
                      {!!servico.equip && (
                        <Text style={styles.cardEquip}>🔧 {servico.equip}</Text>
                      )}
                      {/* Descrição */}
                      {!!servico.desc && (
                        <Text style={styles.cardDesc} numberOfLines={2}>{servico.desc}</Text>
                      )}
                      {coords && (
                        <Text style={styles.cardCoords}>
                          🌐 {coords.lat.toFixed(5)}, {coords.lng.toFixed(5)}
                        </Text>
                      )}

                      {/* Ações */}
                      <View style={styles.cardActions}>
                        <TouchableOpacity
                          style={styles.btnDetails}
                          onPress={() => navigation.navigate('DetalheServico', { servico })}
                        >
                          <Text style={styles.btnDetailsText}>Ver Detalhes</Text>
                        </TouchableOpacity>

                        {['cadastrado', 'pendente'].includes(servico.status) && (
                          <TouchableOpacity
                            style={[styles.btnAcionar, updating === servico.id && styles.btnDisabled]}
                            onPress={() => handleAcionar(servico)}
                            disabled={updating === servico.id}
                          >
                            {updating === servico.id ? (
                              <ActivityIndicator size="small" color="#fff" />
                            ) : (
                              <Text style={styles.btnAcionarText}>⚡ Acionar</Text>
                            )}
                          </TouchableOpacity>
                        )}
                      </View>
                    </View>
                  </View>
                );
              })}
            </>
          )}
        </ScrollView>
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: CORES.bgGlobal },
  webBanner: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    backgroundColor: '#eff6ff',
    borderBottomWidth: 1,
    borderBottomColor: '#bfdbfe',
    paddingHorizontal: 16,
    paddingVertical: 10,
    gap: 10,
  },
  webBannerIcon: { fontSize: 20 },
  webBannerText: {
    flex: 1,
    fontSize: 13,
    color: '#1d4ed8',
    fontWeight: '500',
    lineHeight: 18,
  },
  loadingContainer: { flex: 1, justifyContent: 'center', alignItems: 'center', gap: 12 },
  loadingText: { color: CORES.textoSecundario, fontSize: 14 },
  scrollContent: { padding: 16, paddingBottom: 40 },
  emptyContainer: { alignItems: 'center', paddingTop: 60, gap: 10 },
  emptyIcon: { fontSize: 40 },
  emptyText: { fontSize: 15, color: CORES.textoSecundario, fontWeight: '500' },
  sectionTitle: {
    fontSize: 13,
    fontWeight: '700',
    color: CORES.textoMuted,
    marginBottom: 12,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  card: {
    backgroundColor: CORES.bgCard,
    borderRadius: 12,
    marginBottom: 12,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: CORES.bordaPadrao,
  },
  cardAccent: { height: 3 },
  cardBody: { padding: 14 },
  cardHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 8,
  },
  cardId: { color: CORES.primario, fontSize: 15, fontWeight: '800' },
  badge: { paddingHorizontal: 8, paddingVertical: 3, borderRadius: 6, borderWidth: 1 },
  badgeText: { fontSize: 10, fontWeight: '700', textTransform: 'uppercase' },
  cardLocal: { fontSize: 13, fontWeight: '600', color: CORES.textoPrincipal, marginBottom: 3 },
  cardTipo: { fontSize: 12, color: CORES.textoSecundario, marginBottom: 3 },
  cardEquip: { fontSize: 12, color: '#1d4ed8', fontWeight: '600', marginBottom: 3 },
  cardDesc: { fontSize: 12, color: CORES.textoMuted, fontStyle: 'italic', marginBottom: 4, lineHeight: 16 },
  cardCoords: { fontSize: 11, color: CORES.textoMuted, marginBottom: 10 },
  cardActions: { flexDirection: 'row', gap: 8, marginTop: 6 },
  btnDetails: {
    flex: 1, paddingVertical: 9, borderRadius: 8,
    borderWidth: 1, borderColor: CORES.primario, alignItems: 'center',
  },
  btnDetailsText: { color: CORES.primario, fontSize: 13, fontWeight: '700' },
  btnAcionar: {
    flex: 1, paddingVertical: 9, borderRadius: 8,
    backgroundColor: '#7c3aed', alignItems: 'center', justifyContent: 'center',
  },
  btnDisabled: { opacity: 0.6 },
  btnAcionarText: { color: '#fff', fontSize: 13, fontWeight: '700' },
});
