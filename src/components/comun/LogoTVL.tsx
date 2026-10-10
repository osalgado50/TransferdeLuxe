import Image from "next/image";

// Logo blanco de TVL VIP Transfers (480x526): solo sobre fondos oscuros.
export default function LogoTVL({ alto = 48, prioridad = false, className = "" }: { alto?: number; prioridad?: boolean; className?: string }) {
  return (
    <Image src="/marca/tvl-logo.webp" alt="TVL VIP Transfers Costa Dorada" width={Math.round((alto * 480) / 526)} height={alto}
      priority={prioridad} className={className} style={{ height: alto, width: "auto" }} />
  );
}
