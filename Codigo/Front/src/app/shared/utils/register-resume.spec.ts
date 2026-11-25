import { clearRegisterResume, loadRegisterResume, saveRegisterResume } from './register-resume';

function fakeStorage(): Storage {
  const data = new Map<string, string>();
  return {
    get length() {
      return data.size;
    },
    clear: () => data.clear(),
    getItem: (key: string) => data.get(key) ?? null,
    key: (index: number) => [...data.keys()][index] ?? null,
    removeItem: (key: string) => {
      data.delete(key);
    },
    setItem: (key: string, value: string) => {
      data.set(key, value);
    },
  };
}

describe('register-resume', () => {
  const pending = {
    id: 'reg-1',
    token: 'RY-ab12cd34ef56',
    email: 'ana@test.com',
    phone: '+573001112233',
  };

  it('guarda y restaura el registro pendiente tras cerrar la página', () => {
    const storage = fakeStorage();

    saveRegisterResume(pending, storage);

    expect(loadRegisterResume(storage)).toEqual(pending);
  });

  it('no expone la contraseña y limpia el registro al completar', () => {
    const storage = fakeStorage();
    saveRegisterResume(pending, storage);

    expect(storage.getItem('ry-register-resume')).not.toContain('password');
    clearRegisterResume(storage);
    expect(loadRegisterResume(storage)).toBeNull();
  });

  it('ignora datos corruptos o incompletos', () => {
    const storage = fakeStorage();
    storage.setItem('ry-register-resume', '{no-es-json');
    expect(loadRegisterResume(storage)).toBeNull();

    storage.setItem('ry-register-resume', JSON.stringify({ id: 'reg-1' }));
    expect(loadRegisterResume(storage)).toBeNull();
  });
});
