import React, { useState } from 'react';
import {
  View,
  StyleSheet,
  TouchableOpacity,
  KeyboardAvoidingView,
  Platform,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router } from 'expo-router';
import { useForm, Controller } from 'react-hook-form';
import { z } from 'zod';
import { zodResolver } from '@hookform/resolvers/zod';
import { Ionicons } from '@expo/vector-icons';
import { colors, spacing, layout } from '@/theme';
import { Text, Button, Input } from '@/components/ui';
import { useAuthStore } from '@/store/authStore';
import type { ForgotPasswordForm } from '@/types';

const schema = z.object({
  email: z.string().email('Ingresá un email válido.'),
});

export default function ForgotPasswordScreen() {
  const { resetPassword, isLoading, error, clearError } = useAuthStore();
  const [sent, setSent] = useState(false);

  const {
    control,
    handleSubmit,
    getValues,
    formState: { errors },
  } = useForm<ForgotPasswordForm>({
    resolver: zodResolver(schema),
    defaultValues: { email: '' },
  });

  const onSubmit = async ({ email }: ForgotPasswordForm) => {
    clearError();
    try {
      await resetPassword(email.trim().toLowerCase());
      setSent(true);
    } catch {
      // error en store
    }
  };

  if (sent) {
    return (
      <SafeAreaView style={styles.safe}>
        <View style={styles.container}>
          <Ionicons name="mail-outline" size={64} color={colors.neon} />
          <Text variant="h3" align="center" style={styles.sentTitle}>
            Revisá tu email
          </Text>
          <Text variant="body" color={colors.text.secondary} align="center">
            Te mandamos las instrucciones para recuperar tu contraseña a{' '}
            <Text variant="body" color={colors.text.primary}>
              {getValues('email')}
            </Text>
            .
          </Text>
          <Button
            label="VOLVER AL LOGIN"
            variant="ghost"
            fullWidth
            onPress={() => router.replace('/(auth)/login')}
            style={styles.btn}
          />
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.safe}>
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        style={styles.kav}
      >
        <View style={styles.scroll}>
          <TouchableOpacity onPress={() => router.back()} style={styles.back}>
            <Ionicons name="arrow-back" size={24} color={colors.text.primary} />
          </TouchableOpacity>

          <View style={styles.header}>
            <Text variant="h3">Recuperar contraseña</Text>
            <Text variant="body" color={colors.text.secondary} style={styles.subtitle}>
              Ingresá tu email y te mandamos un link para resetear tu contraseña.
            </Text>
          </View>

          <View style={styles.form}>
            <Controller
              control={control}
              name="email"
              render={({ field: { onChange, onBlur, value } }) => (
                <Input
                  label="EMAIL"
                  placeholder="tu@email.com"
                  value={value}
                  onChangeText={onChange}
                  onBlur={onBlur}
                  error={errors.email?.message}
                  keyboardType="email-address"
                  autoCapitalize="none"
                  autoCorrect={false}
                  returnKeyType="done"
                  onSubmitEditing={handleSubmit(onSubmit)}
                />
              )}
            />

            {error && (
              <View style={styles.errorBox}>
                <Text variant="bodySmall" color={colors.text.error}>
                  {error}
                </Text>
              </View>
            )}

            <Button
              label="ENVIAR INSTRUCCIONES"
              variant="neon"
              size="lg"
              fullWidth
              isLoading={isLoading}
              onPress={handleSubmit(onSubmit)}
            />
          </View>
        </View>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: {
    flex: 1,
    backgroundColor: colors.bg.primary,
  },
  kav: { flex: 1 },
  scroll: {
    flex: 1,
    paddingHorizontal: layout.screenPadding,
  },
  back: {
    paddingTop: spacing[4],
    paddingBottom: spacing[8],
    alignSelf: 'flex-start',
  },
  header: {
    marginBottom: spacing[8],
    gap: spacing[3],
  },
  subtitle: {
    lineHeight: 22,
  },
  form: {
    gap: spacing[4],
  },
  errorBox: {
    backgroundColor: colors.red + '22',
    borderWidth: 1,
    borderColor: colors.border.error,
    padding: spacing[3],
  },
  container: {
    flex: 1,
    paddingHorizontal: layout.screenPadding,
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing[6],
  },
  sentTitle: {
    marginBottom: spacing[1],
  },
  btn: {
    marginTop: spacing[4],
    width: '100%',
  },
});
