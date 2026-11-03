import Image from "next/image";
import Link from "next/link";
import { ArrowLeft } from "@phosphor-icons/react/dist/ssr";
import brandMark from "./icon.svg";

export const metadata = { title: "Page not found" };

export default function NotFound() {
  return (
    <main id="main" className="nf">
      <Image src={brandMark} alt="" width={40} height={40} />
      <h1 className="heading-4">This page does not exist</h1>
      <p className="body-7 lp-muted">The link may be old or mistyped. Nothing was changed.</p>
      <Link className="lp-btn lp-btn-md lp-btn-solid" href="/">
        <ArrowLeft size={16} weight="bold" aria-hidden="true" />
        Back to the home page
      </Link>
    </main>
  );
}
