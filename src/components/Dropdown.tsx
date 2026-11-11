import React, { useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  Modal,
  Pressable,
} from 'react-native';
import Icon from 'react-native-vector-icons/Ionicons';
import { colors } from '../theme';

type Props = {
  value: string;
  options: string[];
  onChange: (value: string) => void;
  enabled?: boolean;
  missing?: boolean;
  placeholder?: string;
};

// Campo que abre una lista de opciones (sin librería de picker): toca el
// campo, elige una opción.
const Dropdown: React.FC<Props> = ({
  value,
  options,
  onChange,
  enabled = true,
  missing = false,
  placeholder = 'Select...',
}) => {
  const [open, setOpen] = useState(false);

  return (
    <>
      <TouchableOpacity
        style={[
          styles.field,
          missing && styles.fieldMissing,
          !enabled && styles.fieldDisabled,
        ]}
        onPress={() => setOpen(true)}
        disabled={!enabled}
        activeOpacity={0.7}
      >
        <Text
          style={[styles.value, !value && styles.placeholder]}
          numberOfLines={1}
        >
          {value || placeholder}
        </Text>
        <Icon name="chevron-down" size={18} color={colors.navy} />
      </TouchableOpacity>

      <Modal
        visible={open}
        transparent
        animationType="fade"
        onRequestClose={() => setOpen(false)}
      >
        <Pressable style={styles.backdrop} onPress={() => setOpen(false)}>
          <View style={styles.sheet}>
            {options.map(option => {
              const selected = option === value;
              return (
                <TouchableOpacity
                  key={option}
                  style={[styles.option, selected && styles.optionSelected]}
                  onPress={() => {
                    onChange(option);
                    setOpen(false);
                  }}
                >
                  <Text
                    style={[
                      styles.optionText,
                      selected && styles.optionTextSelected,
                    ]}
                  >
                    {option}
                  </Text>
                  {selected && (
                    <Icon name="checkmark" size={20} color={colors.navy} />
                  )}
                </TouchableOpacity>
              );
            })}
          </View>
        </Pressable>
      </Modal>
    </>
  );
};

const styles = StyleSheet.create({
  field: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    minWidth: 180,
    borderWidth: 1,
    borderColor: colors.inputBorder,
    borderRadius: 8,
    backgroundColor: colors.inputBg,
    paddingHorizontal: 12,
    paddingVertical: 10,
    gap: 8,
  },
  fieldMissing: {
    borderColor: colors.amber,
    backgroundColor: colors.amberBg,
  },
  fieldDisabled: {
    opacity: 0.6,
  },
  value: {
    flexShrink: 1,
    fontSize: 15,
    fontWeight: '600',
    color: colors.ink,
  },
  placeholder: {
    color: colors.placeholder,
    fontWeight: '400',
  },
  backdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.35)',
    justifyContent: 'center',
    padding: 32,
  },
  sheet: {
    alignSelf: 'center',
    width: '100%',
    maxWidth: 420,
    backgroundColor: '#fff',
    borderRadius: 14,
    paddingVertical: 6,
    elevation: 6,
  },
  option: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 18,
    paddingVertical: 16,
  },
  optionSelected: {
    backgroundColor: colors.navySoft,
  },
  optionText: {
    fontSize: 16,
    color: colors.ink,
  },
  optionTextSelected: {
    fontWeight: '700',
    color: colors.navy,
  },
});

export default Dropdown;
