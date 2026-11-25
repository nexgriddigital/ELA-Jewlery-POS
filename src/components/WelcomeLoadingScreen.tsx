import React from 'react';
import { motion } from 'motion/react';

interface WelcomeLoadingScreenProps {
  userName?: string;
  userRole?: string;
  subtitle?: string;
}

export const WelcomeLoadingScreen: React.FC<WelcomeLoadingScreenProps> = ({
  userName,
  userRole,
  subtitle = 'Preparing your boutique register...',
}) => {
  const cleanName = userName?.trim();

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.35, ease: 'easeOut' }}
      className="fixed inset-0 z-50 min-h-screen bg-[#FAF8F5] flex items-center justify-center px-6 overflow-hidden"
      role="status"
      aria-live="polite"
      aria-label={cleanName ? `Welcome ${cleanName}` : 'Loading ELA Jewelry POS'}
    >
      {/* Warm boutique champagne glow */}
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-0"
        style={{
          background:
            'radial-gradient(circle at 50% 42%, rgba(247, 216, 127, 0.24) 0%, rgba(190, 26, 26, 0.04) 42%, rgba(250, 248, 245, 0) 72%)',
        }}
      />

      <div className="relative z-10 max-w-md w-full text-center flex flex-col items-center">
        {/* Animated Halo + Brand Medallion */}
        <div className="relative w-36 h-36 flex items-center justify-center mb-7">
          {/* Outer rotating gold ring */}
          <motion.div
            aria-hidden="true"
            animate={{ rotate: 360 }}
            transition={{ repeat: Infinity, duration: 7, ease: 'linear' }}
            className="absolute inset-0 rounded-full border-2 border-dashed border-[#D4AF37]/60"
          />

          {/* Inner counter-rotating crimson & gold arc */}
          <motion.div
            aria-hidden="true"
            animate={{ rotate: -360 }}
            transition={{ repeat: Infinity, duration: 2.8, ease: 'linear' }}
            className="absolute inset-2 rounded-full border-2 border-transparent border-t-[#BE1A1A] border-r-[#F7D87F]"
          />

          {/* Logo Container */}
          <motion.div
            initial={{ scale: 0.86, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            transition={{ duration: 0.45, ease: 'easeOut' }}
            className="relative w-24 h-24 rounded-full bg-white shadow-lg shadow-[#231712]/10 border border-[#E8DFD3] flex items-center justify-center p-3"
          >
            <img
              src="./assets/aistudio/image_89dfb75c.png"
              alt="ELA Jewelry"
              className="w-full h-full object-contain"
              referrerPolicy="no-referrer"
            />
          </motion.div>
        </div>

        {/* Eyebrow */}
        <motion.p
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.4, delay: 0.1 }}
          className="font-mono text-[11px] uppercase tracking-[0.24em] text-[#9A7B38] font-semibold"
        >
          ELA Jewellery &amp; Accessories
        </motion.p>

        {/* Personalized Welcome Heading */}
        <motion.h1
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.45, delay: 0.18 }}
          className="font-display text-3xl sm:text-4xl font-semibold text-[#231712] mt-2.5 tracking-tight"
        >
          {cleanName ? `Welcome ${cleanName}` : 'Welcome to ELA Jewelry'}
        </motion.h1>

        {/* Subtitle / Role context */}
        <motion.p
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.45, delay: 0.26 }}
          className="text-sm text-[#766257] mt-2"
        >
          {userRole ? `${userRole} Access · ` : ''}
          {subtitle}
        </motion.p>

        {/* Animated Shimmer Progress Bar */}
        <div className="w-56 h-1.5 bg-[#EDE5D9] rounded-full overflow-hidden mt-6 relative">
          <motion.div
            aria-hidden="true"
            initial={{ x: '-100%' }}
            animate={{ x: '220%' }}
            transition={{ repeat: Infinity, duration: 1.35, ease: 'easeInOut' }}
            className="h-full w-1/2 rounded-full bg-gradient-to-r from-[#F7D87F] via-[#BE1A1A] to-[#F7D87F]"
          />
        </div>
      </div>
    </motion.div>
  );
};
