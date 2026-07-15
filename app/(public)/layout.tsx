import type { Metadata } from "next";
import { FloatingWhatsApp } from "@/app/components/floating-whatsapp";
import { SiteFooter } from "@/app/components/site-footer";
import { SiteHeader } from "@/app/components/site-header";

export const metadata: Metadata = process.env.NEXT_PUBLIC_SITE_URL
  ? { alternates: { canonical: "./" } }
  : {};

export default function PublicLayout({ children }: { children: React.ReactNode }) {
  return (
    <>
      <SiteHeader />
      {children}
      <FloatingWhatsApp />
      <SiteFooter />
    </>
  );
}
