export type BarcodeCameraProps = {
  onCancel: () => void;
  onScanned: (barcode: string) => void;
};

export declare function BarcodeCamera(props: BarcodeCameraProps): ReactElement;
import { ReactElement } from "react";
