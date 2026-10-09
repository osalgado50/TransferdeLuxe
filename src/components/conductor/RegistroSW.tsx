"use client";
import { useEffect } from "react";

export default function RegistroSW() {
  useEffect(() => { void navigator.serviceWorker?.register("/sw.js", { scope: "/" }).catch(() => {}); }, []);
  return null;
}
