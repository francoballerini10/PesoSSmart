# Pesos$mart Mobile — Guía de Setup

## Stack
- React Native + Expo SDK 55
- Expo Router (file-based navigation)
- Supabase (auth, DB, storage, edge functions)
- Zustand (estado global)
- React Hook Form + Zod (formularios y validación)
- Groq API via Edge Functions (IA segura)

---

## 1. Variables de entorno

```bash
cp .env.example .env
```

Completá con los valores de tu proyecto de Supabase:
```
EXPO_PUBLIC_SUPABASE_URL=https://xxxx.supabase.co
EXPO_PUBLIC_SUPABASE_ANON_KEY=eyJ...
```

---

## 2. Base de datos Supabase

En el SQL Editor de Supabase, ejecutar en orden:

```sql
-- 1. Schema principal
-- Pegar contenido de: supabase/schema.sql

-- 2. Políticas RLS
-- Pegar contenido de: supabase/rls.sql

-- 3. Storage buckets y políticas
-- Pegar contenido de: supabase/storage.sql
```

---

## 3. Edge Functions

```bash
# Instalar Supabase CLI
npm install -g supabase

# Login
supabase login

# Link al proyecto
supabase link --project-ref TU_PROJECT_REF

# Configurar secret de Groq (NUNCA en .env del cliente)
supabase secrets set GROQ_API_KEY=gsk_...

# Deploy de la Edge Function
supabase functions deploy ai-advisor
```

---

## 4. Fuentes (assets/fonts/)

Descargar y colocar en `assets/fonts/`:
- [Bebas Neue Regular](https://fonts.google.com/specimen/Bebas+Neue) → `BebasNeue-Regular.ttf`
- [Space Mono Regular](https://fonts.google.com/specimen/Space+Mono) → `SpaceMono-Regular.ttf`
- [Space Mono Bold](https://fonts.google.com/specimen/Space+Mono) → `SpaceMono-Bold.ttf`
- [DM Sans Regular](https://fonts.google.com/specimen/DM+Sans) → `DMSans-Regular.ttf`
- [DM Sans Medium](https://fonts.google.com/specimen/DM+Sans) → `DMSans-Medium.ttf`
- [DM Sans SemiBold](https://fonts.google.com/specimen/DM+Sans) → `DMSans-SemiBold.ttf`
- [DM Sans Bold](https://fonts.google.com/specimen/DM+Sans) → `DMSans-Bold.ttf`

---

## 5. Correr la app

```bash
cd mobile
npm install
npx expo start
```

Para Android: `npx expo run:android`
Para iOS: `npx expo run:ios` (requiere Mac)

---

## Estructura del proyecto

```
mobile/
  app/
    _layout.tsx           ← Root layout, fuentes, sesión
    index.tsx             ← Redirección inteligente
    (auth)/               ← Login, registro, forgot password
    (onboarding)/         ← Onboarding financiero (3 pasos)
    (app)/                ← App principal con tabs
      home.tsx            ← Dashboard
      expenses.tsx        ← Mis gastos
      advisor.tsx         ← Chat con IA
      reports.tsx         ← Informes mensuales
      profile.tsx         ← Perfil y ajustes
  src/
    theme/                ← Colores, tipografía, espaciado
    types/                ← TypeScript completo (DB + UI)
    lib/
      supabase.ts         ← Cliente Supabase tipado
    store/
      authStore.ts        ← Zustand: sesión y perfil
      onboardingStore.ts  ← Zustand: onboarding
      expensesStore.ts    ← Zustand: gastos
    components/ui/        ← Componentes base reutilizables
    utils/
      format.ts           ← Formateo de moneda, fechas, etc.
  supabase/
    schema.sql            ← Tablas, relaciones, enums, triggers
    rls.sql               ← Políticas de seguridad RLS
    storage.sql           ← Buckets y políticas de storage
    functions/
      ai-advisor/         ← Edge Function para Groq (segura)
```

---

## Decisiones de arquitectura

| Decisión | Elegida | Por qué |
|---|---|---|
| Navigation | Expo Router | File-based, tipado, moderno, integrado con Expo |
| State | Zustand | Simple, performante, sin boilerplate |
| Forms | React Hook Form + Zod | Validation robusta, TypeScript nativo |
| Lists | FlatList nativa | Flash-list disponible para optimizar si escala |
| IA | Groq via Edge Function | La API key nunca sale del servidor |
| Auth | Supabase Auth | MFA ready, Google login preparado |
| Storage | Supabase Storage | Integrado con RLS, no necesita backend extra |
| Border radius | 0 (brutalista) | Identidad visual de Pesos$mart |

---

## Próximos pasos (Fase 2+)

- [ ] Clasificación de gastos con IA (Edge Function classify-expense)
- [ ] OCR de tickets (Edge Function process-receipt)
- [ ] Simulador de inversión con datos reales
- [ ] Generación de PDF de informes mensuales
- [ ] Push notifications (Expo Notifications)
- [ ] Login con Google
- [ ] Plan Pro con RevenueCat o MercadoPago
- [ ] Widget de gastos para home screen
