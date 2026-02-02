import { useEffect, useState } from "react";
import { supabase } from "../supabaseClient";

export default function AuthPanel({ onUser }) {
  const [user, setUser] = useState(null);
  const [email, setEmail] = useState("");
  const [pass, setPass] = useState("");
  const [msg, setMsg] = useState("");

  useEffect(() => {
    supabase.auth.getUser().then(({ data }) => {
      setUser(data?.user ?? null);
      onUser?.(data?.user ?? null);
    });

    const { data: sub } = supabase.auth.onAuthStateChange((_event, session) => {
      const u = session?.user ?? null;
      setUser(u);
      onUser?.(u);
    });

    return () => sub?.subscription?.unsubscribe();
  }, [onUser]);

  const signUp = async () => {
    setMsg("");
    const { error } = await supabase.auth.signUp({ email, password: pass });
    if (error) return setMsg(error.message);
    setMsg("Регистрация ок. Если включено подтверждение email — проверь почту.");
  };

  const signIn = async () => {
    setMsg("");
    const { data, error } = await supabase.auth.signInWithPassword({
      email,
      password: pass,
    });
    if (error) return setMsg(error.message);
    setUser(data.user);
    onUser?.(data.user);
  };

  const signOut = async () => {
    await supabase.auth.signOut();
    setUser(null);
    onUser?.(null);
  };

  if (user) {
    return (
      <div style={{ display: "grid", gap: 8 }}>
        <div style={{ fontSize: 12, color: "#555" }}>Signed in:</div>
        <div style={{ wordBreak: "break-all" }}>
          <b>{user.email}</b>
          <div style={{ fontSize: 12, color: "#777" }}>user_id: {user.id}</div>
        </div>
        <button onClick={signOut}>Выйти</button>
      </div>
    );
  }

  return (
    <div style={{ display: "grid", gap: 8 }}>
      <div style={{ fontWeight: 600 }}>Вход / Регистрация</div>
      <input
        placeholder="email"
        value={email}
        onChange={(e) => setEmail(e.target.value)}
        style={{ padding: 8 }}
      />
      <input
        placeholder="password"
        type="password"
        value={pass}
        onChange={(e) => setPass(e.target.value)}
        style={{ padding: 8 }}
      />
      <div style={{ display: "flex", gap: 8 }}>
        <button onClick={signIn}>Войти</button>
        <button onClick={signUp}>Зарегистрироваться</button>
      </div>
      {msg && <div style={{ fontSize: 12, color: "#b00020" }}>{msg}</div>}
    </div>
  );
}
