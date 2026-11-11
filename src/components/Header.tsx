import React from 'react';
import UserHeader from './UserHeader';

type Props = {
  title: string;
  // Ya no se muestra: el botón siempre dice "Back" (como en UserHeader).
  backLabel?: string;
  onBack?: () => void;
  // Dato corto junto al título (ej. "5/22" puntos contestados).
  right?: string;
};

// Mismo encabezado en toda la app: título y "< Back | Nombre | ID | Log out".
const Header: React.FC<Props> = ({ title, onBack, right }) => (
  <UserHeader title={right ? `${title}  (${right})` : title} onBack={onBack} />
);

export default Header;
