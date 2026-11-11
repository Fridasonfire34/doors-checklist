import { StackScreenProps } from '@react-navigation/stack';
import { Door, User } from './api';

export type RootStackParamList = {
  Login: undefined;
  Scan: undefined;
  Jobs: undefined;
  JobMenu: { jobNumber: string };
  StageDoors: { jobNumber: string; stageKey: string; stageTitle: string };
  Stage: { door: Door; stageKey: string; backLabel?: string };
  // fromMenu: abierta desde Door & Frame Build Checklist; al guardar regresa
  // en lugar de seguir al checklist.
  PieceMeasures: { door: Door; stageKey: string; partKey: string; fromMenu?: boolean };
  PartChecklist: { door: Door; stageKey: string; partKey: string };
  Photos: { door: Door };
  Report: { door: Door };
};

export type ScreenProps<T extends keyof RootStackParamList> = StackScreenProps<RootStackParamList, T>;

type StartRoute = {
  [K in keyof RootStackParamList]: { name: K; params?: RootStackParamList[K] };
}[keyof RootStackParamList];

// Vuelve al inicio (el scan) y opcionalmente una pantalla encima.
export function resetToStart(
  navigation: { reset: (state: { index: number; routes: StartRoute[] }) => void },
  _user: User | null,
  top?: StartRoute,
) {
  const routes: StartRoute[] = [{ name: 'Scan' }];
  if (top) routes.push(top);
  navigation.reset({ index: routes.length - 1, routes });
}
