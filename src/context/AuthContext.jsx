import React, { createContext, useContext, useEffect, useState } from 'react';
import { supabase } from '../lib/supabase';

const AuthContext = createContext({});

export function useAuth() {
  return useContext(AuthContext);
}

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let initialized = false;

    // Timeout de segurança: garante que o loading nunca fique infinito
    const safetyTimer = setTimeout(() => {
      if (!initialized) {
        console.warn('AuthContext: timeout de segurança acionado.');
        setLoading(false);
      }
    }, 10000);

    // Escuta mudanças de autenticação (inclui o estado inicial)
    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      async (_event, session) => {
        initialized = true;
        clearTimeout(safetyTimer);
        if (session?.user) {
          await carregarPerfil(session.user);
        } else {
          setUser(null);
          setLoading(false);
        }
      }
    );

    return () => {
      clearTimeout(safetyTimer);
      subscription.unsubscribe();
    };
  }, []);

  async function carregarPerfil(authUser) {
    try {
      const { data, error } = await supabase
        .from('usuarios')
        .select('*')
        .eq('uid', authUser.id)
        .single();

      if (error || !data) {
        console.error('Erro ao buscar perfil:', error);
        await supabase.auth.signOut();
        setUser(null);
        return;
      }

      if (!data.ativo) {
        console.warn('Usuário inativo.');
        await supabase.auth.signOut();
        setUser(null);
        return;
      }

      setUser({
        uid: authUser.id,
        matricula: data.matricula,
        role: data.role,
        label: data.nome,
        equipe: data.equipe,
      });
    } catch (err) {
      console.error('Erro inesperado ao carregar perfil:', err);
      setUser(null);
    } finally {
      // SEMPRE desativar o loading, independente do caminho executado
      setLoading(false);
    }
  }

  async function login(matricula, senha) {
    const email = matricula.trim() + '@visaodedono.com';

    const { data, error } = await supabase.auth.signInWithPassword({
      email,
      password: senha,
    });

    if (error) {
      throw new Error(error.message);
    }

    // O perfil será carregado pelo onAuthStateChange
    return data;
  }

  async function logout() {
    await supabase.auth.signOut();
    setUser(null);
  }

  return (
    <AuthContext.Provider value={{ user, loading, login, logout }}>
      {children}
    </AuthContext.Provider>
  );
}
