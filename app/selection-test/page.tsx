import packageInfo from "@/package.json";
import SelectionTestClient from "./SelectionTestClient";
import "./selection-test.css";

export default function SelectionTestPage() {
  return <SelectionTestClient appVersion={packageInfo.version} />;
}
