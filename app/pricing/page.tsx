'use client';

import Link from 'next/link';
import { motion } from 'framer-motion';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { 
  Check, 
  Sparkles, 
  Gavel, 
  TrendingUp,
  Star,
  ArrowRight,
  Zap,
  Shield,
  Crown,
  CheckCircle2,
  Search
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { CreateListingGateButton } from '@/components/listings/CreateListingGate';
import { BottomNav } from '@/components/navigation/BottomNav';
import { PLAN_CONFIG, getPlanConfig, type PlanId } from '@/lib/pricing/plans';

export default function PricingPage() {
  const containerVariants = {
    hidden: { opacity: 0 },
    visible: {
      opacity: 1,
      transition: {
        staggerChildren: 0.1,
      },
    },
  };

  const itemVariants = {
    hidden: { opacity: 0, y: 20 },
    visible: {
      opacity: 1,
      y: 0,
      transition: {
        duration: 0.5,
      },
    },
  };

  const pricingTiers = [
    {
      id: 'free' as PlanId,
      name: PLAN_CONFIG.free.displayName,
      description: 'Best for occasional listings',
      price: PLAN_CONFIG.free.monthlyPrice,
      priceLabel: PLAN_CONFIG.free.monthlyPrice === 0 ? 'Free' : `$${PLAN_CONFIG.free.monthlyPrice}`,
      period: PLAN_CONFIG.free.monthlyPrice === 0 ? '' : '/month',
      icon: Gavel,
      gradient: 'from-secondary to-secondary/90',
      borderColor: 'border-primary/20',
      badge: null,
      features: [
        `${PLAN_CONFIG.free.listingLimit} active listings`,
        `${(PLAN_CONFIG.free.takeRate * 100).toFixed(0)}% transaction fee`,
        'Standard listing visibility',
        'Basic seller profile',
        'Standard support',
      ],
      cta: 'Start Free',
      popular: false,
    },
    {
      id: 'pro' as PlanId,
      name: PLAN_CONFIG.pro.displayName,
      description: 'Best for active breeders',
      price: PLAN_CONFIG.pro.monthlyPrice,
      priceLabel: `$${PLAN_CONFIG.pro.monthlyPrice}`,
      period: '/month',
      icon: TrendingUp,
      gradient: 'from-primary to-primary/90',
      borderColor: 'border-primary/30',
      badge: 'Most Popular',
      features: [
        `${PLAN_CONFIG.pro.listingLimit} active listings`,
        `${(PLAN_CONFIG.pro.takeRate * 100).toFixed(0)}% transaction fee`,
        'Featured placement options',
        'Basic analytics',
        'Priority support',
      ],
      cta: 'Go Pro',
      popular: true,
    },
    {
      id: 'elite' as PlanId,
      name: PLAN_CONFIG.elite.displayName,
      description: 'Best for ranches and high volume',
      price: PLAN_CONFIG.elite.monthlyPrice,
      priceLabel: `$${PLAN_CONFIG.elite.monthlyPrice}`,
      period: '/month',
      icon: Crown,
      gradient: 'from-secondary to-secondary/90',
      borderColor: 'border-primary/20',
      badge: null,
      features: [
        'Unlimited active listings',
        `${(PLAN_CONFIG.elite.takeRate * 100).toFixed(0)}% transaction fee`,
        'Priority support',
        'Broker tools (coming soon)',
        'Custom pricing available',
      ],
      cta: 'Talk to Sales',
      popular: false,
    },
  ];

  const listingFees = [
    {
      type: 'Auction Listing',
      description: 'Set starting bid and let buyers compete',
      fee: '4-7% of final bid (varies by plan)',
      minimum: '$50 minimum',
      featured: '+$25',
      icon: Gavel,
      color: 'text-primary',
      bgColor: 'bg-primary/10',
      borderColor: 'border-primary/20',
    },
    {
      type: 'Fixed Price',
      description: 'Set your price and sell instantly',
      fee: '4-7% of sale price (varies by plan)',
      minimum: '$50 minimum',
      featured: '+$25',
      icon: CheckCircle2,
      color: 'text-accent',
      bgColor: 'bg-accent/10',
      borderColor: 'border-accent/20',
    },
    {
      type: 'Classified',
      description: 'Contact-based listings',
      fee: '$25 flat fee',
      minimum: 'No minimum',
      featured: '+$15',
      icon: Star,
      color: 'text-secondary',
      bgColor: 'bg-secondary/10',
      borderColor: 'border-secondary/20',
    },
  ];

  const additionalFees = [
    {
      name: 'Featured Listing',
      description: 'Get premium placement on homepage and search results',
      price: '$25',
      duration: '7 days',
      icon: Sparkles,
    },
    {
      name: 'Verification',
      description: 'Optional verification of listing details (coming soon)',
      price: 'Coming soon',
      duration: 'Per listing',
      icon: Shield,
    },
    {
      name: 'Transport Coordination',
      description: 'Coordinated transport arrangements (coming soon)',
      price: 'Coming soon',
      duration: 'Per order',
      icon: CheckCircle2,
    },
    {
      name: 'Insurance Options',
      description: 'Optional insurance coverage (coming soon)',
      price: 'Coming soon',
      duration: 'Per transaction',
      icon: Shield,
    },
  ];

  return (
    <div className="min-h-screen bg-background pb-24 md:pb-4">
      {/* Hero Section */}
      <section className="relative overflow-hidden bg-background">
        <div className="absolute inset-0 bg-secondary/10" />
        
        <div className="relative container mx-auto px-4 py-16 md:py-24 lg:py-32">
          <motion.div
            initial={{ opacity: 0, y: 30 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.8 }}
            className="text-center space-y-6 max-w-4xl mx-auto"
          >
            <motion.div
              initial={{ scale: 0.9, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              transition={{ duration: 0.6, delay: 0.2 }}
              className="inline-flex items-center gap-3 mb-4"
            >
              <div className="relative">
                <div className="absolute inset-0 bg-primary/5 blur-2xl rounded-full" />
                <Sparkles className="relative h-12 w-12 md:h-16 md:w-16 text-primary" />
              </div>
              <h1 className="text-4xl md:text-6xl lg:text-7xl font-extrabold tracking-tight font-founders">
                <span className="gradient-text">Pricing</span>
              </h1>
            </motion.div>

            <motion.h2
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.6, delay: 0.4 }}
              className="text-2xl md:text-3xl lg:text-4xl font-bold text-foreground leading-tight font-founders"
            >
              Pricing for sellers
            </motion.h2>

            <motion.p
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.6, delay: 0.6 }}
              className="text-base md:text-lg lg:text-xl text-muted-foreground max-w-2xl mx-auto leading-relaxed"
            >
              Create an account, list animals, and reach serious buyers. Upgrade for more listings and visibility.
            </motion.p>
          </motion.div>
        </div>
      </section>

      {/* Pricing Tiers */}
      <section className="container mx-auto px-4 py-12 md:py-20">
        <motion.div
          initial="hidden"
          whileInView="visible"
          viewport={{ once: true, margin: "-100px" }}
          variants={containerVariants}
          className="space-y-12"
        >
          <motion.div variants={itemVariants} className="text-center space-y-3">
            <Badge className="px-4 py-1.5 text-sm font-bold bg-primary/10 border-primary/20 text-primary mb-2">
              Subscription Plans
            </Badge>
            <h2 className="text-3xl md:text-5xl font-extrabold text-foreground font-founders">
              Choose Your Plan
            </h2>
            <p className="text-lg md:text-xl text-muted-foreground max-w-2xl mx-auto">
              Start free and upgrade as you grow. Cancel anytime.
            </p>
          </motion.div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-6 md:gap-8">
            {pricingTiers.map((tier, index) => {
              const Icon = tier.icon;
              return (
                <motion.div
                  key={tier.name}
                  variants={itemVariants}
                  className="relative"
                  whileHover={{ y: -8 }}
                  transition={{ duration: 0.3 }}
                >
                  {tier.popular && (
                    <div className="absolute -top-4 left-1/2 -translate-x-1/2 z-20">
                      <Badge className={cn(
                        'px-4 py-1.5 text-sm font-bold shadow-lg',
                        'bg-accent text-accent-foreground',
                        'text-white border border-yellow-300/50',
                        'animate-pulse'
                      )}>
                        <Sparkles className="h-3 w-3 mr-1 fill-current" />
                        {tier.badge}
                      </Badge>
                    </div>
                  )}
                  
                  <Card className={cn(
                    'h-full border-2 transition-all duration-300 relative overflow-hidden',
                    tier.popular 
                      ? 'border-primary/50 shadow-2xl shadow-primary/20 scale-105' 
                      : 'border-border/50 hover:border-primary/30',
                    'bg-gradient-to-br from-card via-card to-card/95',
                    'hover:shadow-2xl hover:shadow-primary/10',
                    'group'
                  )}>
                    {/* Decorative gradient background */}
                    <div className={cn(
                      'absolute inset-0 opacity-0 group-hover:opacity-100 transition-opacity duration-500',
                      tier.gradient === 'from-secondary to-secondary/90' && 'bg-gradient-to-br from-secondary/5 via-secondary/5 to-transparent',
                      tier.gradient === 'from-primary to-primary/90' && 'bg-card/50',
                      tier.gradient === 'from-secondary to-secondary/90' && 'bg-gradient-to-br from-secondary/5 via-secondary/5 to-transparent'
                    )} />
                    
                    <CardHeader className="relative z-10 pb-4">
                      <div className="flex items-center justify-between mb-4">
                        <div className={cn(
                          'w-16 h-16 rounded-2xl flex items-center justify-center',
                          'shadow-lg shadow-primary/20',
                          'group-hover:scale-110 transition-transform duration-300',
                          tier.gradient === 'from-secondary to-secondary/90' && 'bg-gradient-to-br from-secondary to-secondary/90',
                          tier.gradient === 'from-primary to-primary/90' && 'bg-primary text-primary-foreground',
                          tier.gradient === 'from-secondary to-secondary/90' && 'bg-gradient-to-br from-secondary to-secondary/90'
                        )}>
                          <Icon className="h-8 w-8 text-white" />
                        </div>
                        {tier.badge && !tier.popular && (
                          <Badge variant="outline" className="font-semibold">
                            {tier.badge}
                          </Badge>
                        )}
                      </div>
                      <CardTitle className="text-2xl md:text-3xl font-extrabold group-hover:text-primary transition-colors">
                        {tier.name}
                      </CardTitle>
                      <CardDescription className="text-base font-medium">
                        {tier.description}
                      </CardDescription>
                    </CardHeader>
                    
                    <CardContent className="relative z-10 space-y-6">
                      <div className="space-y-2">
                        <div className="flex items-baseline gap-2">
                          <span className="text-4xl md:text-5xl font-extrabold text-foreground">
                            {tier.priceLabel}
                          </span>
                          {tier.period && (
                            <span className="text-lg text-muted-foreground font-semibold">
                              {tier.period}
                            </span>
                          )}
                        </div>
                        {tier.price === 0 && (
                          <p className="text-sm text-muted-foreground font-medium">
                            No credit card required
                          </p>
                        )}
                      </div>

                      <div className="space-y-3 pt-4 border-t border-border/50">
                        {tier.features.map((feature, featureIndex) => (
                          <div
                            key={featureIndex}
                            className="flex items-start gap-3"
                          >
                            <CheckCircle2 className="h-5 w-5 text-green-600 flex-shrink-0 mt-0.5" />
                            <span className="text-sm font-semibold leading-relaxed">{feature}</span>
                          </div>
                        ))}
                      </div>

                      <CreateListingGateButton
                        href="/dashboard/listings/new"
                        className={cn(
                          'w-full min-h-[52px] font-bold text-base',
                          tier.popular
                            ? 'bg-accent text-accent-foreground hover:shadow-xl hover:shadow-accent/40'
                            : 'bg-accent text-accent-foreground hover:shadow-lg hover:shadow-accent/30',
                          'transition-all duration-300 hover:scale-[1.02] active:scale-[0.98]'
                        )}
                      >
                        {tier.cta}
                        <ArrowRight className="h-5 w-5" />
                      </CreateListingGateButton>
                    </CardContent>
                  </Card>
                </motion.div>
              );
            })}
          </div>
        </motion.div>
      </section>

      {/* Listing Fees */}
      {/* Section - Consistent Background */}
      <section className="container mx-auto px-4 py-16 md:py-24">
        <motion.div
          initial="hidden"
          whileInView="visible"
          viewport={{ once: true }}
          variants={containerVariants}
          className="space-y-12"
        >
          <motion.div variants={itemVariants} className="text-center space-y-3">
            <Badge className="px-4 py-1.5 text-sm font-bold bg-primary/10 border-primary/20 text-primary mb-2">
              Listing Fees
            </Badge>
            <h2 className="text-3xl md:text-5xl font-extrabold">
              Transaction fee
            </h2>
            <p className="text-lg md:text-xl text-muted-foreground max-w-2xl mx-auto">
              A small percentage applies when a sale completes.
            </p>
          </motion.div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-6 md:gap-8">
            {listingFees.map((fee, index) => {
              const Icon = fee.icon;
              return (
                <motion.div key={fee.type} variants={itemVariants}>
                  <Card className={cn(
                    'h-full border-2 border-border/50 transition-all duration-300',
                    'bg-gradient-to-br from-card to-card/95',
                    'hover:border-primary/30 hover:shadow-xl hover:shadow-primary/10',
                    'group'
                  )}>
                    <CardContent className="pt-8 pb-8 px-6 space-y-4">
                      <div className={cn(
                        'w-16 h-16 rounded-2xl flex items-center justify-center border-2',
                        'shadow-lg shadow-primary/10',
                        'group-hover:scale-110 transition-transform duration-300',
                        fee.bgColor,
                        fee.borderColor
                      )}>
                        <Icon className={cn('h-8 w-8', fee.color)} />
                      </div>
                      <h3 className="text-2xl font-extrabold text-foreground group-hover:text-primary transition-colors font-founders">
                        {fee.type}
                      </h3>
                      <p className="text-sm text-muted-foreground leading-relaxed font-medium">
                        {fee.description}
                      </p>
                      <div className="space-y-2 pt-4 border-t border-border/50">
                        <div className="flex items-center justify-between">
                          <span className="text-sm font-semibold text-muted-foreground">Platform Fee:</span>
                          <span className="text-lg font-bold text-foreground">{fee.fee}</span>
                        </div>
                        <div className="flex items-center justify-between">
                          <span className="text-sm font-semibold text-muted-foreground">Minimum:</span>
                          <span className="text-sm font-bold text-foreground">{fee.minimum}</span>
                        </div>
                        <div className="flex items-center justify-between pt-2 border-t border-border/30">
                          <span className="text-sm font-semibold text-primary">Featured:</span>
                          <Badge variant="outline" className="font-bold">{fee.featured}</Badge>
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                </motion.div>
              );
            })}
          </div>
        </motion.div>
      </section>

      {/* Additional Services */}
      <section className="container mx-auto px-4 py-12 md:py-20">
        <motion.div
          initial="hidden"
          whileInView="visible"
          viewport={{ once: true }}
          variants={containerVariants}
          className="space-y-12"
        >
          <motion.div variants={itemVariants} className="text-center space-y-3">
            <Badge className="px-4 py-1.5 text-sm font-bold bg-primary/10 border-primary/20 text-primary mb-2">
              Optional Services
            </Badge>
            <h2 className="text-3xl md:text-5xl font-extrabold text-foreground font-founders">
              Optional services (coming soon)
            </h2>
            <p className="text-lg md:text-xl text-muted-foreground max-w-2xl mx-auto">
              Verification, transport coordination, insurance options
            </p>
          </motion.div>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 md:gap-6">
            {additionalFees.map((service, index) => {
              const Icon = service.icon;
              return (
                <motion.div key={service.name} variants={itemVariants}>
                  <Card className={cn(
                    'h-full border-2 border-border/50 transition-all duration-300',
                    'bg-gradient-to-br from-card to-card/95',
                    'hover:border-primary/30 hover:shadow-lg hover:shadow-primary/10',
                    'group'
                  )}>
                    <CardContent className="pt-6 pb-6 px-6 space-y-3">
                      <div className="w-12 h-12 rounded-xl bg-primary/10 flex items-center justify-center border border-primary/20 group-hover:bg-primary/20 transition-colors">
                        <Icon className="h-6 w-6 text-primary" />
                      </div>
                      <h3 className="text-lg font-bold text-foreground group-hover:text-primary transition-colors font-founders">
                        {service.name}
                      </h3>
                      <p className="text-xs text-muted-foreground leading-relaxed font-medium">
                        {service.description}
                      </p>
                      <div className="pt-3 border-t border-border/30">
                        <div className="text-xl font-extrabold text-foreground">
                          {service.price}
                        </div>
                        <div className="text-xs text-muted-foreground font-medium mt-1">
                          {service.duration}
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                </motion.div>
              );
            })}
          </div>
        </motion.div>
      </section>

      {/* FAQ Section */}
      {/* Section - Consistent Background */}
      <section className="container mx-auto px-4 py-16 md:py-24">
        <motion.div
          initial="hidden"
          whileInView="visible"
          viewport={{ once: true }}
          variants={containerVariants}
          className="space-y-12 max-w-4xl mx-auto"
        >
          <motion.div variants={itemVariants} className="text-center space-y-3">
            <h2 className="text-3xl md:text-5xl font-extrabold text-foreground font-founders">
              Frequently Asked Questions
            </h2>
            <p className="text-lg text-muted-foreground max-w-2xl mx-auto">
              Common questions about pricing and fees
            </p>
          </motion.div>

          <div className="space-y-4">
            {[
              {
                q: 'When do I pay platform fees?',
                a: 'Platform fees are only charged when your listing sells. If your item doesn\'t sell, you pay nothing.',
              },
              {
                q: 'Can I change my plan later?',
                a: 'Yes! You can upgrade, downgrade, or cancel your subscription at any time. Changes take effect immediately.',
              },
              {
                q: 'What payment methods do you accept?',
                a: 'We accept all major credit cards, debit cards, and ACH transfers. All payments are processed securely.',
              },
              {
                q: 'Are there any hidden fees?',
                a: 'No hidden fees. All fees are clearly displayed upfront. You only pay platform fees when your item sells, plus any optional services you choose.',
              },
              {
                q: 'Do buyers pay any fees?',
                a: 'Buyers pay a small buyer protection fee (typically 2-3%) which covers transaction security, dispute resolution, and buyer protection.',
              },
            ].map((faq, index) => (
              <motion.div key={index} variants={itemVariants}>
                <Card className={cn(
                  'border-2 border-border/50',
                  'bg-gradient-to-br from-card to-card/95',
                  'hover:border-primary/30 transition-all duration-300',
                  'shadow-lg hover:shadow-xl'
                )}>
                  <CardContent className="p-6 space-y-2">
                    <h3 className="text-lg font-bold text-foreground font-founders flex items-center gap-2">
                      <span className="w-6 h-6 rounded-full bg-primary/10 flex items-center justify-center text-sm font-extrabold text-primary">
                        Q
                      </span>
                      {faq.q}
                    </h3>
                    <p className="text-sm text-muted-foreground leading-relaxed pl-8 font-medium">
                      {faq.a}
                    </p>
                  </CardContent>
                </Card>
              </motion.div>
            ))}
          </div>
        </motion.div>
      </section>

      {/* CTA Section */}
      <section className="container mx-auto px-4 py-12 md:py-20">
        <motion.div
          initial={{ opacity: 0, scale: 0.95 }}
          whileInView={{ opacity: 1, scale: 1 }}
          viewport={{ once: true }}
          transition={{ duration: 0.5 }}
        >
          <Card className={cn(
            'relative overflow-hidden',
            'border-2 border-primary/20',
            'bg-card',
            'shadow-premium'
          )}>
            <div className="absolute top-0 right-0 w-64 h-64 bg-primary/10 rounded-full blur-3xl" />
            <div className="absolute bottom-0 left-0 w-64 h-64 bg-primary/10 rounded-full blur-3xl" />
            
            <CardContent className="pt-16 pb-16 px-8 relative z-10 text-center space-y-6">
              <h2 className="text-3xl md:text-4xl lg:text-5xl font-extrabold text-foreground font-founders">
                Ready to list breeder stock or exotics?
              </h2>
              <p className="text-lg md:text-xl text-muted-foreground max-w-2xl mx-auto">
                Reach serious buyers across Texas.
              </p>
              <div className="flex flex-col sm:flex-row gap-4 justify-center pt-4">
                <CreateListingGateButton
                  href="/dashboard/listings/new"
                  size="lg"
                  className={cn(
                    'min-h-[56px] min-w-[220px] text-lg font-semibold',
                    'bg-primary text-primary-foreground',
                    'hover:shadow-xl hover:shadow-primary/40',
                    'transition-all duration-300'
                  )}
                >
                  <Zap className="h-5 w-5" />
                  Create a Listing
                </CreateListingGateButton>
                <Button 
                  asChild 
                  variant="outline" 
                  size="lg"
                  className={cn(
                    'min-h-[56px] min-w-[220px] text-lg font-semibold',
                    'border-2 border-border hover:border-primary/50',
                    'hover:bg-muted',
                    'transition-all duration-300'
                  )}
                >
                  <Link href="/browse" className="flex items-center justify-center gap-2">
                    Browse Listings
                    <ArrowRight className="h-5 w-5" />
                  </Link>
                </Button>
              </div>
            </CardContent>
          </Card>
        </motion.div>
      </section>

      {/* Mobile Bottom Navigation */}
      <BottomNav />
    </div>
  );
}
