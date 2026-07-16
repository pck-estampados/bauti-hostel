import { FloatingWhatsApp } from "@/app/components/floating-whatsapp";
import { SiteFooter } from "@/app/components/site-footer";
import { SiteHeader } from "@/app/components/site-header";
import { getPublicSiteContent } from "@/app/lib/public-site-content";

export default async function PublicLayout({ children }: { children: React.ReactNode }) {
  const content = await getPublicSiteContent();
  return (
    <>
      <SiteHeader content={content} />
      {children}
      <FloatingWhatsApp content={content} />
      <SiteFooter content={content} />
    </>
  );
}
