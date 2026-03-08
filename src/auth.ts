export type UserRecord = {
  id: number;
  username: string;
  firstName: string;
  lastName: string;
  gender: "M" | "F" | "X";
  yearOfBirth: number;
  teacher: boolean;
  englishName?: string;
};

const KEY = "echo_user";

export function getUser(): UserRecord | null {
  const raw = localStorage.getItem(KEY);
  if (!raw) return null;
  try {
    return JSON.parse(raw) as UserRecord;
  } catch {
    return null;
  }
}

export function setUser(user: UserRecord) {
  localStorage.setItem(KEY, JSON.stringify(user));
}

export function clearUser() {
  localStorage.removeItem(KEY);
}