import React from "react";

export default function HomeProfessional() {
  return (
    <main className="min-h-screen bg-slate-950 text-white">
      <section className="mx-auto grid max-w-7xl gap-8 px-6 py-10 lg:grid-cols-[1.2fr_0.8fr]">
        <HeroPanel />
        <AuthPanel />
      </section>
    </main>
  );
}

// Stubs para HeroPanel e AuthPanel (substitua por implementações reais)
function HeroPanel() {
  return <div className="rounded-xl bg-slate-900 p-8">Hero/branding</div>;
}
function AuthPanel() {
  return <div className="rounded-xl bg-slate-800 p-8">Login/Cadastro</div>;
}
