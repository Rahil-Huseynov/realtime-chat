import React from 'react';
import { View, Pressable, Text, StyleSheet } from 'react-native';
import { useLocale } from '../i18n';
import type { Locale } from '../i18n/translations';

const languages: { code: Locale; label: string }[] = [
  { code: 'az', label: 'AZ' },
  { code: 'en', label: 'EN' },
  { code: 'ru', label: 'RU' },
];

export default function LanguageSwitcher() {
  const { locale, setLocale } = useLocale();

  return (
    <View style={styles.container} accessibilityRole="tablist">
      {languages.map((lang) => {
        const isActive = locale === lang.code;
        return (
          <Pressable
            key={lang.code}
            onPress={() => setLocale(lang.code)}
            style={[styles.btn, isActive && styles.active]}
            accessibilityState={{ selected: isActive }}
          >
            <Text style={[styles.label, isActive && styles.labelActive]}>
              {lang.label}
            </Text>
          </Pressable>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    backgroundColor: '#1a2234',
    borderRadius: 10,
    padding: 3,
    gap: 2,
  },
  btn: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 8,
  },
  active: {
    backgroundColor: '#5b7cfa',
  },
  label: {
    color: '#8b9bb4',
    fontWeight: '600',
    fontSize: 13,
  },
  labelActive: {
    color: '#fff',
  },
});