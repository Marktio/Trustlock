import Image from "next/image";
import Link from "next/link";
import { ArrowLeft } from "@phosphor-icons/react/dist/ssr";
import brandMark from "./icon.svg";
import { getT } from "@/i18n/server";

export async function generateMetadata() {
  const t = await getT();
  return { title: t("Page not found") };
}

export default async function NotFound() {
  const t = await getT();
  return (
    <main id="main" className="nf">
      <Image src={brandMark} alt="" width={40} height={40} />
      <h1 className="heading-4">{t("This page does not exist")}</h1>
      <p className="body-7 lp-muted">{t("The link may be old or mistyped. Nothing was changed.")}</p>
      <Link className="lp-btn lp-btn-md lp-btn-solid" href="/">
        <ArrowLeft size={16} weight="bold" aria-hidden="true" />
        {t("Back to the home page")}
      </Link>
    </main>
  );
}
