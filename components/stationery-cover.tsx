import { stationeryCoverUrl } from "@/lib/stationery-cover";
export default function StationeryCover({ title, color }: { title: string; color: string }) {
  return (
    <img
      data-stationery-cover="true"
      src={stationeryCoverUrl(title, color)}
      alt=""
      draggable={false}
      style={{
        position: "absolute",
        inset: 0,
        width: "100%",
        height: "100%",
        objectFit: "fill",
        zIndex: 6,
      }}
    />
  );
}
