"use client";

import { useState, useRef } from "react";
import { createClient } from "@/lib/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Upload, X, Video, Image as ImageIcon } from "lucide-react";
import { toast } from "sonner";

interface MediaUploadProps {
  type: "video" | "image";
  currentUrl: string | null;
  onUpload: (url: string | null) => void;
}

export function MediaUpload({ type, currentUrl, onUpload }: MediaUploadProps) {
  const [uploading, setUploading] = useState(false);
  const [preview, setPreview] = useState<string | null>(currentUrl);
  const inputRef = useRef<HTMLInputElement>(null);

  async function handleFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;

    const maxMb = type === "video" ? 100 : 10;
    if (file.size > maxMb * 1024 * 1024) {
      toast.error(`File must be under ${maxMb}MB`);
      return;
    }

    setUploading(true);
    const supabase = createClient();
    const ext = file.name.split(".").pop();
    const path = `${type}s/${Date.now()}-${Math.random().toString(36).slice(2)}.${ext}`;

    const { error } = await supabase.storage
      .from("exercise-media")
      .upload(path, file, { upsert: true });

    if (error) {
      toast.error("Upload failed: " + error.message);
      setUploading(false);
      return;
    }

    const { data } = supabase.storage.from("exercise-media").getPublicUrl(path);
    setPreview(data.publicUrl);
    onUpload(data.publicUrl);
    setUploading(false);
  }

  function handleRemove() {
    setPreview(null);
    onUpload(null);
    if (inputRef.current) inputRef.current.value = "";
  }

  const accept = type === "video" ? "video/*" : "image/*";
  const Icon = type === "video" ? Video : ImageIcon;

  return (
    <div className="space-y-2">
      <Label>{type === "video" ? "Demo Video" : "Exercise Image"}</Label>

      {preview ? (
        <div className="relative rounded-lg overflow-hidden border bg-muted">
          {type === "video" ? (
            <video src={preview} controls className="w-full max-h-48 object-cover" />
          ) : (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={preview} alt="Exercise" className="w-full max-h-48 object-cover" />
          )}
          <Button
            type="button"
            variant="destructive"
            size="icon"
            className="absolute top-2 right-2 h-7 w-7"
            onClick={handleRemove}
          >
            <X className="h-3 w-3" />
          </Button>
        </div>
      ) : (
        <div
          className="border-2 border-dashed rounded-lg p-6 text-center cursor-pointer hover:bg-accent/50 transition-colors"
          onClick={() => inputRef.current?.click()}
        >
          <Icon className="h-8 w-8 mx-auto mb-2 text-muted-foreground" />
          <p className="text-sm text-muted-foreground">
            {uploading ? "Uploading…" : `Click to upload ${type === "video" ? "(MP4, MOV — max 100MB)" : "(JPG, PNG — max 10MB)"}`}
          </p>
        </div>
      )}

      <Input
        ref={inputRef}
        type="file"
        accept={accept}
        className="hidden"
        onChange={handleFile}
        disabled={uploading}
      />
    </div>
  );
}
