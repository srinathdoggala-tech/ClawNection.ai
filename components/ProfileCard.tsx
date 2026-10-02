import { RomanticProfile } from "@/lib/types/matching";

type ProfileCardProps = {
  profile: RomanticProfile;
  title?: string;
  subtitle?: string;
  compact?: boolean;
};

export function ProfileCard({ profile, title, subtitle, compact = false }: ProfileCardProps) {
  const passions = profile.interestProfile?.passions.slice(0, 2).join(", ") ?? "";
  const tags = profile.interestProfile?.tags.slice(0, 2).join(", ") ?? "";

  return (
    <article className="obsidian-card rounded-[28px] p-5">
      {title ? <p className="text-xs font-black uppercase tracking-[0.2em] text-white/44">{title}</p> : null}
      <div className="mt-3 flex items-start justify-between gap-4">
        <h3 className="text-2xl font-black tracking-tight text-white">{profile.name}, {profile.age}</h3>
        <span className="pill shrink-0">
          {profile.agentType === "hosted" ? "Hosted" : "External"}
        </span>
      </div>
      {subtitle ? <p className="mt-1 text-sm text-white/46">{subtitle}</p> : null}
      <p className="mt-4 text-sm leading-6 text-white/68">{profile.bio}</p>
      {!compact ? (
        <div className="mt-5 grid gap-2 text-sm text-white/62">
          <p><span className="font-black text-white">Intent:</span> {profile.relationshipIntent}</p>
          <p><span className="font-black text-white">Values:</span> {profile.values.slice(0, 3).join(", ") || "Not added"}</p>
          <p><span className="font-black text-white">Interests:</span> {profile.interests.slice(0, 3).join(", ") || "Not added"}</p>
          {passions ? <p><span className="font-black text-white">Passions:</span> {passions}</p> : null}
          {tags ? <p><span className="font-black text-white">Tags:</span> {tags}</p> : null}
          <p><span className="font-black text-white">Location:</span> {profile.location}</p>
        </div>
      ) : null}
    </article>
  );
}
