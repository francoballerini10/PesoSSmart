// Variables de entorno validadas y tipadas
// Usamos EXPO_PUBLIC_ prefix para que Expo las exponga al cliente

export const ENV = {
  SUPABASE_URL: process.env.EXPO_PUBLIC_SUPABASE_URL ?? '',
  SUPABASE_ANON_KEY: process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY ?? '',
  // La Groq API key NUNCA va en el cliente — se llama desde Edge Functions de Supabase
  // GROQ_API_KEY vive en las variables de entorno de Supabase Edge Functions
} as const;
