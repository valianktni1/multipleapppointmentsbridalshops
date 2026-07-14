import React, { useEffect, useState } from "react";
import { toast } from "sonner";
import { Upload } from "lucide-react";
import api, { apiErr } from "@/lib/api";
import { useAuth } from "@/context/AuthContext";
import { useTenant } from "@/context/TenantContext";
import { PageHead, Panel, Field } from "@/components/admin/ui";

export default function Branding() {
  const { refresh } = useAuth();
  const tctx = useTenant();
  const [b, setB] = useState(null);

  useEffect(() => { api.get("/branding").then((r) => setB(r.data)).catch((e) => toast.error(apiErr(e))); }, []);

  const set = (patch) => setB({ ...b, ...patch });

  const onLogo = (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (file.size > 2_000_000) { toast.error("Please choose an image under 2MB"); return; }
    const reader = new FileReader();
    reader.onload = () => set({ logo_data: reader.result });
    reader.readAsDataURL(file);
  };

  const save = async () => {
    try {
      await api.put("/branding", b);
      toast.success("Branding saved");
      await refresh();
      if (tctx?.reload) await tctx.reload();
      // apply colours live
      document.documentElement.style.setProperty("--gold", b.primary_color);
      document.documentElement.style.setProperty("--gold-deep", b.accent_color);
    } catch (e) { toast.error(apiErr(e)); }
  };

  if (!b) return <p className="eyebrow">Loading…</p>;
  const logo = b.logo_data || b.logo_url;

  return (
    <div className="reveal-up">
      <PageHead eyebrow="White-label" title="Branding" />
      <div className="grid lg:grid-cols-2 gap-6">
        <Panel>
          <h3 className="text-2xl mb-6">Identity</h3>
          <div className="space-y-5">
            <Field label="Brand Name">
              <input className="input-wtb" value={b.brand_name || ""} data-testid="brand-name"
                onChange={(e) => set({ brand_name: e.target.value })} placeholder="Superbrides" />
            </Field>
            <Field label="Tagline">
              <input className="input-wtb" value={b.tagline || ""} data-testid="brand-tagline"
                onChange={(e) => set({ tagline: e.target.value })} placeholder="Bridal Appointments" />
            </Field>
            <div>
              <p className="field-label mb-2">Logo</p>
              <div className="flex items-center gap-4">
                <div className="w-28 h-20 border flex items-center justify-center overflow-hidden" style={{ borderColor: "var(--line)", background: "var(--ivory-2)" }}>
                  {logo ? <img src={logo} alt="Logo" className="max-w-full max-h-full" data-testid="logo-preview" /> : <span className="eyebrow" style={{ fontSize: "0.5rem" }}>No logo</span>}
                </div>
                <label className="btn-wtb btn-ghost-wtb cursor-pointer" data-testid="logo-upload-label">
                  <Upload size={14} className="mr-2" /> Upload
                  <input type="file" accept="image/*" className="hidden" onChange={onLogo} data-testid="logo-upload" />
                </label>
                {logo && <button className="eyebrow" style={{ color: "#9a4a3f", fontSize: "0.55rem" }} onClick={() => set({ logo_data: "", logo_url: "" })} data-testid="logo-remove">Remove</button>}
              </div>
              <p className="font-sans-j text-xs mt-2" style={{ color: "var(--taupe)" }}>PNG or SVG on a transparent background works best. Max 2MB.</p>
            </div>
          </div>
        </Panel>

        <Panel>
          <h3 className="text-2xl mb-6">Colours</h3>
          <div className="space-y-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="field-label mb-1">Primary Colour</p>
                <p className="font-sans-j text-xs" style={{ color: "var(--taupe)" }}>Buttons & highlights</p>
              </div>
              <div className="flex items-center gap-3">
                <input type="color" value={b.primary_color || "#B0904F"} data-testid="primary-color"
                  onChange={(e) => set({ primary_color: e.target.value })} className="w-12 h-10 border-0 cursor-pointer" />
                <input className="input-wtb w-28" value={b.primary_color || ""} onChange={(e) => set({ primary_color: e.target.value })} />
              </div>
            </div>
            <div className="flex items-center justify-between">
              <div>
                <p className="field-label mb-1">Accent Colour</p>
                <p className="font-sans-j text-xs" style={{ color: "var(--taupe)" }}>Hover & deep tone</p>
              </div>
              <div className="flex items-center gap-3">
                <input type="color" value={b.accent_color || "#977937"} data-testid="accent-color"
                  onChange={(e) => set({ accent_color: e.target.value })} className="w-12 h-10 border-0 cursor-pointer" />
                <input className="input-wtb w-28" value={b.accent_color || ""} onChange={(e) => set({ accent_color: e.target.value })} />
              </div>
            </div>
            <div className="border-t pt-5" style={{ borderColor: "var(--line)" }}>
              <p className="field-label mb-3">Preview</p>
              <div className="flex items-center gap-3">
                <button className="btn-wtb" style={{ background: b.primary_color, borderColor: b.primary_color, color: "#fff" }} data-testid="preview-btn">Sample Button</button>
                <span className="wordmark text-3xl" style={{ color: b.accent_color }}>{b.brand_name || "Brand"}</span>
              </div>
            </div>
          </div>
        </Panel>
      </div>
      <button className="btn-wtb btn-gold mt-8" onClick={save} data-testid="save-branding">Save Branding</button>
    </div>
  );
}
