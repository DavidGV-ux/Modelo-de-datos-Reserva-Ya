/** Estado mínimo para retomar la verificación si se cierra la página. Nunca guarda la contraseña. */
export interface RegisterResume {
  id: string;
  token: string;
  email: string;
  phone: string;
}

const STORAGE_KEY = 'ry-register-resume';

export function saveRegisterResume(data: RegisterResume, storage: Storage): void {
  storage.setItem(STORAGE_KEY, JSON.stringify(data));
}

export function loadRegisterResume(storage: Storage): RegisterResume | null {
  try {
    const raw = storage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const value = JSON.parse(raw) as Partial<RegisterResume>;
    return value.id && value.token ? (value as RegisterResume) : null;
  } catch {
    return null;
  }
}

export function clearRegisterResume(storage: Storage): void {
  storage.removeItem(STORAGE_KEY);
}
