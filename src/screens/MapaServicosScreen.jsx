import React, { useEffect, useState, useRef, useLayoutEffect, useCallback, Component } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ActivityIndicator,
  Alert,
  Platform,
  Dimensions,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import MapView, { Marker, Callout } from 'react-native-maps';
import { useNavigation } from '@react-navigation/native';
import * as Location from 'expo-location';

import { supabase } from '../lib/supabase';
import { CORES } from '../constants/CORES';
import { STATUS_CONFIG } from '../constants/STATUS_CONFIG';

const { width, height } = Dimensions.get('window');

// ─── Error Boundary ──────────────────────────────────────────────────────────
// Catches native MapView crashes (e.g. missing/invalid Google Maps API key)
// that bypass React state handlers and would otherwise crash the whole app.
class MapErrorBoundary extends Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error) {
    return { hasError: true, error };
  }

  componentDidCatch(error, info) {
    console.error('[MapErrorBoundary] Mapa falhou:', error, info);
  }

  render() {
    if (this.state.hasError) {
      return this.props.fallback || null;
    }
    return this.props.children;
  }
}
// ─────────────────────────────────────────────────────────────────────────────

export default function MapaServicosScreen() {
  const navigation = useNavigation();
  const mapRef = useRef(null);
  const mapReady = useRef(false);

  const [servicos, setServicos] = useState([]);
  const [loading, setLoading] = useState(true);
  const [updating, setUpdating] = useState(null); // id do serviço sendo atualizado
  const [userLocation, setUserLocation] = useState(null);
  const [mapError, setMapError] = useState(false);

  useLayoutEffect(() => {
    navigation.setOptions({ title: 'Mapa de Serviços' });
  }, [navigation]);

  useEffect(() => {
    fetchServicos();
    getUserLocation();

    // Realtime
    const channel = supabase
      .channel('mapa_servicos_changes')
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'servicos' },
        () => fetchServicos()
      )
      .subscribe();

    return () => { supabase.removeChannel(channel); };
  }, []);

  async function getUserLocation() {
    try {
      const { status } = await Location.requestForegroundPermissionsAsync();
      if (status === 'granted') {
        const loc = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced });
        setUserLocation({
          latitude: loc.coords.latitude,
          longitude: loc.coords.longitude,
        });
      }
    } catch (_) { }
  }

  async function fetchServicos() {
    try {
      setLoading(true);
      // RLS (tecnico_ve_proprios_servicos) already filters to the
      // logged-in technician / team — no manual filter needed.
      const { data, error } = await supabase
        .from('servicos')
        .select('*');

      if (!error) {
        setServicos(data || []);
      }
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  }

  // Converte string de coordenadas → { latitude, longitude }
  function parseCoords(coordStr) {
    if (!coordStr) return null;
    const parts = coordStr.trim().split(/[\s,]+/);
    if (parts.length < 2) return null;
    const lat = parseFloat(parts[0]);
    const lng = parseFloat(parts[1]);
    if (isNaN(lat) || isNaN(lng)) return null;
    return { latitude: lat, longitude: lng };
  }

  // Serviços com coordenadas válidas
  const servicosComPin = servicos.filter((s) => parseCoords(s.coord) !== null);

  // Região inicial: prioriza localização do usuário, senão enquadra pins
  function getInitialRegion() {
    if (userLocation) {
      return { ...userLocation, latitudeDelta: 0.08, longitudeDelta: 0.08 };
    }
    if (servicosComPin.length > 0) {
      const coords = servicosComPin.map((s) => parseCoords(s.coord));
      const avgLat = coords.reduce((acc, c) => acc + c.latitude, 0) / coords.length;
      const avgLng = coords.reduce((acc, c) => acc + c.longitude, 0) / coords.length;

      const latDeltas = coords.map((c) => Math.abs(c.latitude - avgLat));
      const lngDeltas = coords.map((c) => Math.abs(c.longitude - avgLng));
      const latDelta = Math.max(...latDeltas) * 2.5 + 0.01;
      const lngDelta = Math.max(...lngDeltas) * 2.5 + 0.01;

      return { latitude: avgLat, longitude: avgLng, latitudeDelta: latDelta, longitudeDelta: lngDelta };
    }
    // Fallback Brasil
    return { latitude: -15.7942, longitude: -47.8825, latitudeDelta: 10, longitudeDelta: 10 };
  }

  // Após mapa pronto + serviços carregados, enquadra todos os pins
  const fitAllPins = useCallback(() => {
    if (!mapReady.current || servicosComPin.length === 0) return;
    const coords = servicosComPin.map((s) => parseCoords(s.coord));
    mapRef.current?.fitToCoordinates(coords, {
      edgePadding: { top: 80, right: 40, bottom: 100, left: 40 },
      animated: true,
    });
  }, [servicosComPin]);

  // Quando serviços carregam, enquadra os pins (se usuário não tinha localização)
  useEffect(() => {
    if (!loading && servicosComPin.length > 0 && !userLocation) {
      // pequeno delay para garantir que o mapa já renderizou
      const timer = setTimeout(fitAllPins, 400);
      return () => clearTimeout(timer);
    }
  }, [loading, servicosComPin.length, userLocation, fitAllPins]);

  async function handleAcionarDoMapa(servico) {
    Alert.alert(
      'Acionar Serviço',
      `Deseja acionar a OS #${servico.id}?`,
      [
        { text: 'Cancelar', style: 'cancel' },
        {
          text: 'Acionar',
          onPress: async () => {
            setUpdating(servico.id);
            try {
              const { error } = await supabase
                .from('servicos')
                .update({ status: 'acionado' })
                .eq('id', servico.id);
              if (error) throw error;
              // A lista se atualiza via realtime
            } catch (err) {
              Alert.alert('Erro', 'Não foi possível acionar o serviço.');
            } finally {
              setUpdating(null);
            }
          },
        },
      ]
    );
  }

  // Centraliza o mapa na localização atual do usuário
  function centralizarNaMinhaLocalizacao() {
    if (userLocation) {
      mapRef.current?.animateToRegion(
        { ...userLocation, latitudeDelta: 0.02, longitudeDelta: 0.02 },
        600
      );
    } else {
      Alert.alert('Localização', 'Não foi possível obter sua localização. Verifique se as permissões estão habilitadas.');
    }
  }

  if (mapError) {
    return (
      <SafeAreaView style={styles.container} edges={['bottom', 'left', 'right']}>
        <View style={styles.errorContainer}>
          <Text style={styles.errorIcon}>🗺️</Text>
          <Text style={styles.errorTitle}>Mapa indisponível</Text>
          <Text style={styles.errorMsg}>
            O Google Maps SDK falhou ao inicializar.{`\n\n`}
            Verifique no Google Cloud Console:{`\n`}
            • API "Maps SDK for Android" está habilitada?{`\n`}
            • A chave tem restrição correta (package + SHA-1)?{`\n\n`}
            Após corrigir, gere um novo build via EAS.
          </Text>
          <TouchableOpacity
            style={styles.errorBtn}
            onPress={() => navigation.goBack()}
          >
            <Text style={styles.errorBtnText}>← Voltar</Text>
          </TouchableOpacity>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.container} edges={['bottom', 'left', 'right']}>
      {loading ? (
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color={CORES.primario} />
          <Text style={styles.loadingText}>Carregando serviços...</Text>
        </View>
      ) : (
        <>
          <MapErrorBoundary
            fallback={
              <View style={styles.errorContainer}>
                <Text style={styles.errorIcon}>🗺️</Text>
                <Text style={styles.errorTitle}>Mapa indisponível</Text>
                <Text style={styles.errorMsg}>
                  O Google Maps SDK falhou ao inicializar.{`\n\n`}
                  Verifique se a Google Maps API Key está correta e se a API{`\n`}
                  "Maps SDK for Android" está habilitada no Google Cloud Console.
                </Text>
                <TouchableOpacity style={styles.errorBtn} onPress={() => navigation.goBack()}>
                  <Text style={styles.errorBtnText}>← Voltar</Text>
                </TouchableOpacity>
              </View>
            }
          >
          <MapView
            ref={mapRef}
            style={styles.map}
            initialRegion={getInitialRegion()}
            onMapReady={() => {
              setMapError(false);
              mapReady.current = true;
            }}
            onError={(e) => {
              console.error('[MapView] onError:', e?.nativeEvent);
              setMapError(true);
            }}
            showsUserLocation
            showsMyLocationButton={false}
          >
            {servicosComPin.map((servico) => {
              const coord = parseCoords(servico.coord);
              const statusInfo = STATUS_CONFIG[servico.status] || {
                color: '#64748b', label: servico.status, pinColor: '#64748b',
              };

              return (
                <Marker
                  key={servico.id}
                  coordinate={coord}
                  pinColor={statusInfo.pinColor || '#64748b'}
                  title={`OS #${servico.id}`}
                  description={servico.local || ''}
                >
                  <Callout
                    tooltip
                    style={styles.callout}
                    onPress={() => { }}
                  >
                    <View style={styles.calloutBox}>
                      {/* Cabeçalho */}
                      <View style={styles.calloutHeader}>
                        <Text style={styles.calloutId}>OS #{servico.id}</Text>
                        <View style={[
                          styles.calloutBadge,
                          { backgroundColor: statusInfo.bg || '#f8fafc', borderColor: statusInfo.border || '#e2e8f0' }
                        ]}>
                          <Text style={[styles.calloutBadgeText, { color: statusInfo.color }]}>
                            {statusInfo.label}
                          </Text>
                        </View>
                      </View>

                      {/* Local */}
                      {!!servico.local && (
                        <Text style={styles.calloutLocal} numberOfLines={1}>
                          📍 {servico.local}
                        </Text>
                      )}

                      {/* Tipo de serviço */}
                      {!!servico.tipo && (
                        <Text style={styles.calloutTipo} numberOfLines={1}>
                          {servico.tipo}
                        </Text>
                      )}

                      {/* Equipamento */}
                      {!!servico.equip && (
                        <Text style={styles.calloutEquip} numberOfLines={1}>
                          🔧 {servico.equip}
                        </Text>
                      )}

                      {/* Descrição */}
                      {!!servico.desc && (
                        <Text style={styles.calloutDesc} numberOfLines={2}>
                          {servico.desc}
                        </Text>
                      )}

                      {/* Botões */}
                      <View style={styles.calloutActions}>
                        <TouchableOpacity
                          style={styles.calloutBtnDetails}
                          onPress={() => navigation.navigate('DetalheServico', { servico })}
                        >
                          <Text style={styles.calloutBtnDetailsText}>Ver Detalhes</Text>
                        </TouchableOpacity>

                        {['cadastrado', 'pendente'].includes(servico.status) && (
                          <TouchableOpacity
                            style={[
                              styles.calloutBtnAcionar,
                              updating === servico.id && styles.calloutBtnDisabled,
                            ]}
                            onPress={() => handleAcionarDoMapa(servico)}
                            disabled={updating === servico.id}
                          >
                            {updating === servico.id ? (
                              <ActivityIndicator size="small" color="#fff" />
                            ) : (
                              <Text style={styles.calloutBtnAcionarText}>⚡ Acionar</Text>
                            )}
                          </TouchableOpacity>
                        )}
                      </View>
                    </View>
                  </Callout>
                </Marker>
              );
            })}
          </MapView>
          </MapErrorBoundary>

          {/* Overlay superior: legenda de status (mostra apenas status que existem nos dados) */}
          <View style={styles.legend}>
            {Object.keys(STATUS_CONFIG)
              .filter((s) => servicos.some((sv) => sv.status === s))
              .map((s) => {
                const cfg = STATUS_CONFIG[s];
                const count = servicos.filter((sv) => sv.status === s).length;
                return (
                  <View key={s} style={styles.legendItem}>
                    <View style={[styles.legendDot, { backgroundColor: cfg.pinColor }]} />
                    <Text style={styles.legendText}>{cfg.label} ({count})</Text>
                  </View>
                );
              })}
          </View>

          {/* Botões flutuantes */}
          <View style={styles.fab}>
            {/* Centralizar na minha localização */}
            <TouchableOpacity style={styles.fabBtn} onPress={centralizarNaMinhaLocalizacao}>
              <Text style={styles.fabIcon}>📍</Text>
            </TouchableOpacity>

            {/* Enquadrar todos os pins */}
            {servicosComPin.length > 0 && (
              <TouchableOpacity style={styles.fabBtn} onPress={fitAllPins}>
                <Text style={styles.fabIcon}>⊙</Text>
              </TouchableOpacity>
            )}

            {/* Atualizar */}
            <TouchableOpacity style={styles.fabBtn} onPress={fetchServicos}>
              <Text style={styles.fabIcon}>↻</Text>
            </TouchableOpacity>
          </View>

          {/* Aviso quando nenhum pin tem coordenada */}
          {servicosComPin.length === 0 && servicos.length > 0 && (
            <View style={styles.noGpsBar}>
              <Text style={styles.noGpsText}>
                ⚠️ Nenhuma OS possui coordenadas GPS cadastradas
              </Text>
            </View>
          )}
          {servicos.length === 0 && !loading && (
            <View style={styles.noGpsBar}>
              <Text style={styles.noGpsText}>Nenhum serviço ativo atribuído a você</Text>
            </View>
          )}
        </>
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: CORES.bgGlobal,
  },
  errorContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 32,
    gap: 12,
  },
  errorIcon: {
    fontSize: 56,
    marginBottom: 8,
  },
  errorTitle: {
    fontSize: 20,
    fontWeight: '700',
    color: CORES.primario,
    textAlign: 'center',
  },
  errorMsg: {
    fontSize: 13,
    color: CORES.textoSecundario,
    textAlign: 'center',
    lineHeight: 20,
  },
  errorBtn: {
    marginTop: 16,
    paddingVertical: 12,
    paddingHorizontal: 28,
    backgroundColor: CORES.primario,
    borderRadius: 10,
  },
  errorBtnText: {
    color: '#fff',
    fontWeight: '700',
    fontSize: 15,
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    gap: 12,
  },
  loadingText: {
    color: CORES.textoSecundario,
    fontSize: 14,
    fontWeight: '500',
  },
  map: {
    flex: 1,
    width: '100%',
  },
  // Callout
  callout: {
    width: 260,
  },
  calloutBox: {
    backgroundColor: '#ffffff',
    borderRadius: 14,
    padding: 14,
    borderWidth: 1,
    borderColor: '#e2e8f0',
  },
  calloutHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 8,
    paddingBottom: 8,
    borderBottomWidth: 1,
    borderBottomColor: '#f1f5f9',
  },
  calloutId: {
    fontSize: 15,
    fontWeight: '800',
    color: CORES.primario,
  },
  calloutBadge: {
    paddingHorizontal: 7,
    paddingVertical: 3,
    borderRadius: 6,
    borderWidth: 1,
  },
  calloutBadgeText: {
    fontSize: 10,
    fontWeight: '700',
    textTransform: 'uppercase',
  },
  calloutLocal: {
    fontSize: 13,
    fontWeight: '600',
    color: CORES.textoPrincipal,
    marginBottom: 4,
  },
  calloutTipo: {
    fontSize: 12,
    color: CORES.textoSecundario,
    marginBottom: 3,
  },
  calloutEquip: {
    fontSize: 12,
    color: '#1d4ed8',
    fontWeight: '600',
    marginBottom: 3,
  },
  calloutDesc: {
    fontSize: 11,
    color: CORES.textoMuted,
    fontStyle: 'italic',
    marginBottom: 10,
    lineHeight: 16,
  },
  calloutActions: {
    flexDirection: 'row',
    gap: 8,
  },
  calloutBtnDetails: {
    flex: 1,
    paddingVertical: 8,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: CORES.primario,
    alignItems: 'center',
  },
  calloutBtnDetailsText: {
    color: CORES.primario,
    fontSize: 12,
    fontWeight: '700',
  },
  calloutBtnAcionar: {
    flex: 1,
    paddingVertical: 8,
    borderRadius: 8,
    backgroundColor: CORES.primario,
    alignItems: 'center',
    justifyContent: 'center',
  },
  calloutBtnDisabled: {
    opacity: 0.6,
  },
  calloutBtnAcionarText: {
    color: '#ffffff',
    fontSize: 12,
    fontWeight: '700',
  },
  // Legenda
  legend: {
    position: 'absolute',
    top: Platform.OS === 'ios' ? 12 : 12,
    left: 12,
    right: 12,
    backgroundColor: 'rgba(255,255,255,0.95)',
    borderRadius: 14,
    borderWidth: 1,
    borderColor: '#e2e8f0',
    paddingHorizontal: 12,
    paddingVertical: 8,
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'center',
    gap: 4,
  },
  legendItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
  },
  legendDot: {
    width: 10,
    height: 10,
    borderRadius: 5,
  },
  legendText: {
    fontSize: 11,
    fontWeight: '600',
    color: CORES.textoPrincipal,
  },
  // FABs
  fab: {
    position: 'absolute',
    bottom: 24,
    right: 16,
    gap: 10,
  },
  fabBtn: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: CORES.primario,
    justifyContent: 'center',
    alignItems: 'center',
    shadowColor: CORES.primario,
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.35,
    shadowRadius: 6,
    elevation: 4,
  },
  fabIcon: {
    color: '#ffffff',
    fontSize: 22,
    fontWeight: '700',
    lineHeight: 26,
  },
  // Aviso sem GPS
  noGpsBar: {
    position: 'absolute',
    bottom: 90,
    left: 16,
    right: 16,
    backgroundColor: 'rgba(15,37,68,0.85)',
    borderRadius: 10,
    paddingVertical: 10,
    paddingHorizontal: 14,
    alignItems: 'center',
  },
  noGpsText: {
    color: '#ffffff',
    fontSize: 12,
    fontWeight: '600',
    textAlign: 'center',
  },
});
