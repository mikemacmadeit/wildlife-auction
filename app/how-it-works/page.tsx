'use client';

import Link from 'next/link';
import { motion } from 'framer-motion';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { 
  Search, 
  Upload, 
  Gavel, 
  Shield, 
  Truck, 
  CheckCircle2,
  ArrowRight,
  Sparkles,
  Users,
  TrendingUp,
  Clock,
  CreditCard,
  MessageCircle,
  FileText,
  Star
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { CreateListingGateButton } from '@/components/listings/CreateListingGate';

export default function HowItWorksPage() {
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

  const steps = [
    {
      number: 1,
      title: 'Create a listing',
      description: 'Add photos, genetics/notes, location, and sale type. Choose between auction, fixed price, or classified formats. Include health certificates, registration papers, and detailed descriptions to attract serious buyers.',
      icon: Upload,
      gradient: 'from-primary to-primary/90',
      features: ['Add multiple photos', 'Genetics and breeding notes', 'Location and pickup details', 'Auction, fixed price, or classified'],
    },
    {
      number: 2,
      title: 'Buyers inquire or bid',
      description: 'Auctions feature real-time bidding with automatic increments. Fixed-price listings allow instant purchase. Classified listings enable direct negotiation. All formats support direct messaging with sellers.',
      icon: Gavel,
      gradient: 'from-primary to-primary/90',
      features: ['Real-time auction bidding', 'Fixed price instant buy', 'Classified negotiation', 'Direct seller messaging'],
    },
    {
      number: 3,
      title: 'Close with confidence',
      description: 'Secure payment processing with clear terms. Complete documentation including health records, registration papers, and transfer documents. Full transaction history maintained for your records.',
      icon: CheckCircle2,
      gradient: 'from-primary to-primary/90',
      features: ['Secure payment processing', 'Complete documentation', 'Health & registration papers', 'Full transaction history'],
    },
    {
      number: 4,
      title: 'Verification & transport (coming soon)',
      description: 'Optional seller verification confirms identity and eligibility. Transport coordination service will help arrange pickup and delivery. Insurance options available for qualified transactions.',
      icon: Shield,
      gradient: 'from-primary to-primary/90',
      features: ['Optional seller verification', 'Transport coordination (coming soon)', 'Insurance options (coming soon)', 'Trusted partner network'],
    },
  ];

  const features = [
    {
      icon: Shield,
      title: 'Verified Sellers',
      description: 'Optional verification available. Seller identity confirmed and eligible to trade. Look for the verified badge on listings.',
      color: 'text-primary',
      bgColor: 'bg-primary/10',
      borderColor: 'border-primary/20',
    },
    {
      icon: Upload,
      title: 'Clear Listings',
      description: 'Include photos, genetics, registration, health notes, and pickup terms. Detailed listings attract serious buyers.',
      color: 'text-primary',
      bgColor: 'bg-primary/10',
      borderColor: 'border-primary/20',
    },
    {
      icon: MessageCircle,
      title: 'Direct Communication',
      description: 'Contact sellers directly through the platform. Ask questions about genetics, health, transport, and terms before purchase.',
      color: 'text-primary',
      bgColor: 'bg-primary/10',
      borderColor: 'border-primary/20',
    },
    {
      icon: FileText,
      title: 'Complete Documentation',
      description: 'Paperwork, certificates, and health records included with listings. All documentation stored securely for your records.',
      color: 'text-primary',
      bgColor: 'bg-primary/10',
      borderColor: 'border-primary/20',
    },
    {
      icon: Truck,
      title: 'Delivery Planning',
      description: 'Coordinate pickup and delivery details with the seller after purchase. Agchange does not provide or arrange transport.',
      color: 'text-primary',
      bgColor: 'bg-primary/10',
      borderColor: 'border-primary/20',
    },
    {
      icon: CreditCard,
      title: 'Secure Transactions',
      description: 'Clear payment terms. Secure payment processing. Optional payout-hold protection for qualified transactions. Full transaction history.',
      color: 'text-primary',
      bgColor: 'bg-primary/10',
      borderColor: 'border-primary/20',
    },
  ];

  return (
    <div className="min-h-screen bg-background pb-bottom-nav-safe md:pb-4">
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
                How Agchange works
              </h1>
            </motion.div>

            <motion.p
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.6, delay: 0.4 }}
              className="text-xl md:text-2xl lg:text-3xl font-bold text-foreground leading-tight font-founders"
            >
              Clear process. Clear terms. Clear communication.
            </motion.p>
            <motion.p
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.6, delay: 0.6 }}
              className="text-base md:text-lg text-muted-foreground max-w-3xl mx-auto pt-4"
            >
              Agchange connects breeders, ranchers, and buyers across Texas. Whether you're selling trophy whitetail, registered livestock, cattle, or equipment, our platform makes listing and buying straightforward and secure.
            </motion.p>

            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.6, delay: 0.8 }}
              className="flex flex-col sm:flex-row gap-4 justify-center pt-6"
            >
              <CreateListingGateButton
                href="/dashboard/listings/new"
                size="lg"
                className={cn(
                  'min-h-[56px] min-w-[220px] text-lg font-semibold',
                  'bg-primary text-primary-foreground',
                  'hover:bg-primary/90',
                  'shadow-lg shadow-primary/20 hover:shadow-xl hover:shadow-primary/30',
                  'transition-all duration-300'
                )}
              >
                <Upload className="h-5 w-5" />
                List Your Item
              </CreateListingGateButton>
              <Button 
                asChild 
                variant="outline" 
                size="lg"
                className={cn(
                  'min-h-[56px] min-w-[220px] text-lg font-semibold',
                  'border-2 border-border hover:border-foreground/30',
                  'hover:bg-muted',
                  'transition-all duration-300'
                )}
              >
                <Link href="/browse" className="flex items-center gap-2">
                  <Search className="h-5 w-5" />
                  Browse Listings
                </Link>
              </Button>
            </motion.div>
          </motion.div>
        </div>
      </section>

      {/* Sub-categories (Plans + Trust) */}
      <section className="container mx-auto px-4 -mt-8 md:-mt-12 pb-12">
        <div className="grid gap-4 md:grid-cols-3">
          <Card className="border-2 hover:border-primary/40 transition-colors">
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <TrendingUp className="h-5 w-5 text-primary" />
                Seller Tiers
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <p className="text-sm text-muted-foreground">
                Understand seller tiers, placement, and how to get more eyes on your listings.
              </p>
              <Button asChild className="w-full">
                <Link href="/how-it-works/plans" className="flex items-center justify-center gap-2">
                  View plans <ArrowRight className="h-4 w-4" />
                </Link>
              </Button>
            </CardContent>
          </Card>

          <Card className="border-2 hover:border-primary/40 transition-colors">
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Shield className="h-5 w-5 text-primary" />
                Trust & Compliance
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <p className="text-sm text-muted-foreground">
                What badges mean, how verification works, and what’s required for regulated categories.
              </p>
              <Button asChild className="w-full" variant="outline">
                <Link href="/how-it-works/trust" className="flex items-center justify-center gap-2">
                  Learn trust basics <ArrowRight className="h-4 w-4" />
                </Link>
              </Button>
            </CardContent>
          </Card>

          <Card className="border-2 hover:border-primary/40 transition-colors">
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <FileText className="h-5 w-5 text-primary" />
                Field Notes
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <p className="text-sm text-muted-foreground">
                Guides and insights for high-ticket marketplace transactions.
              </p>
              <Button asChild className="w-full" variant="secondary">
                <Link href="/field-notes" className="flex items-center justify-center gap-2">
                  Read Field Notes <ArrowRight className="h-4 w-4" />
                </Link>
              </Button>
            </CardContent>
          </Card>
        </div>
      </section>

      {/* Steps Section */}
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
              Simple Process
            </Badge>
            <h2 className="text-3xl md:text-5xl font-extrabold text-foreground font-founders">
              Listing Types: Auction / Fixed / Classified
            </h2>
          </motion.div>

          <div className="space-y-12 md:space-y-16">
            {steps.map((step, index) => {
              const Icon = step.icon;
              const isEven = index % 2 === 0;
              
              return (
                <motion.div
                  key={step.number}
                  variants={itemVariants}
                  className="relative"
                >
                  <Card className={cn(
                    'border-2 border-border/50 overflow-hidden',
                    'bg-gradient-to-br from-card via-card to-card/95',
                    'hover:border-primary/30 transition-all duration-300',
                    'shadow-xl hover:shadow-2xl hover:shadow-primary/10',
                    'group'
                  )}>
                          <div className={cn(
                            'absolute inset-0 opacity-0 group-hover:opacity-100 transition-opacity duration-500',
                            'bg-gradient-to-br from-primary/5 via-transparent to-primary/5'
                          )} />
                    
                    <CardContent className="p-6 md:p-8 lg:p-10 relative z-10">
                      <div className={cn(
                        'flex flex-col',
                        isEven ? 'md:flex-row' : 'md:flex-row-reverse',
                        'gap-8 md:gap-12 items-center'
                      )}>
                        {/* Icon and Number */}
                        <div className="flex-shrink-0">
                          <div className={cn(
                            'relative w-32 h-32 md:w-40 md:h-40 rounded-3xl',
                            'flex items-center justify-center',
                            'shadow-xl shadow-primary/20',
                            'group-hover:scale-110 transition-transform duration-300',
                            'bg-gradient-to-br from-primary to-primary/90'
                          )}>
                            <div className="absolute -top-3 -right-3 w-12 h-12 rounded-full bg-background border-4 border-accent/20 flex items-center justify-center shadow-lg">
                              <span className="text-2xl font-extrabold text-primary">{step.number}</span>
                            </div>
                            <Icon className="h-16 w-16 md:h-20 md:w-20 text-white" />
                          </div>
                        </div>

                        {/* Content */}
                        <div className="flex-1 space-y-4">
                          <div className="space-y-2">
                            <h3 className="text-2xl md:text-3xl lg:text-4xl font-extrabold group-hover:text-primary transition-colors font-founders">
                              {step.title}
                            </h3>
                            <p className="text-base md:text-lg text-muted-foreground leading-relaxed">
                              {step.description}
                            </p>
                          </div>

                          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-2">
                            {step.features.map((feature, featureIndex) => (
                              <div
                                key={featureIndex}
                                className="flex items-center gap-2 p-3 rounded-lg bg-primary/10 border border-primary/20 hover:border-primary/40 hover:bg-primary/15 transition-colors"
                              >
                                <CheckCircle2 className="h-4 w-4 text-primary flex-shrink-0" />
                                <span className="text-sm font-semibold">{feature}</span>
                              </div>
                            ))}
                          </div>
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

      {/* Features Section - Consistent Background */}
      <section className="container mx-auto px-4 py-16 md:py-24">
        <motion.div
          initial="hidden"
          whileInView="visible"
          viewport={{ once: true }}
          variants={containerVariants}
          className="space-y-12"
        >
          <motion.div variants={itemVariants} className="text-center space-y-3">
            <h2 className="text-3xl md:text-5xl font-extrabold text-foreground font-founders">
              Best Practices
            </h2>
            <p className="text-lg md:text-xl text-muted-foreground max-w-2xl mx-auto">
              For sellers: photos, genetics, terms. For buyers: questions, transport planning.
            </p>
            <p className="text-base text-muted-foreground max-w-3xl mx-auto pt-2">
              Successful listings include multiple high-quality photos, detailed genetics and breeding history, current health certificates, registration papers (if applicable), and clear pickup or transport terms. Buyers should ask questions about genetics, health status, and transport arrangements before committing to purchase.
            </p>
          </motion.div>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6 md:gap-8">
            {features.map((feature, index) => {
              const Icon = feature.icon;
              return (
                <motion.div key={feature.title} variants={itemVariants}>
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
                        feature.bgColor,
                        feature.borderColor
                      )}>
                        <Icon className={cn('h-8 w-8', feature.color)} />
                      </div>
                      <h3 className="text-xl font-bold text-foreground group-hover:text-primary transition-colors font-founders">
                        {feature.title}
                      </h3>
                      <p className="text-sm text-muted-foreground leading-relaxed">
                        {feature.description}
                      </p>
                    </CardContent>
                  </Card>
                </motion.div>
              );
            })}
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
                Reach serious buyers across Texas. List your breeder stock, exotics, cattle, horses, or equipment today.
              </p>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-6 pt-8 max-w-4xl mx-auto">
                <div className="space-y-2">
                  <div className="flex items-center justify-center gap-2 text-primary">
                    <Users className="h-6 w-6" />
                    <span className="text-2xl font-bold">500+</span>
                  </div>
                  <p className="text-sm text-muted-foreground">Active Buyers</p>
                </div>
                <div className="space-y-2">
                  <div className="flex items-center justify-center gap-2 text-primary">
                    <TrendingUp className="h-6 w-6" />
                    <span className="text-2xl font-bold">$2M+</span>
                  </div>
                  <p className="text-sm text-muted-foreground">Total Sales Volume</p>
                </div>
                <div className="space-y-2">
                  <div className="flex items-center justify-center gap-2 text-primary">
                    <Star className="h-6 w-6" />
                    <span className="text-2xl font-bold">4.8/5</span>
                  </div>
                  <p className="text-sm text-muted-foreground">Average Rating</p>
                </div>
              </div>
              <div className="flex flex-col sm:flex-row gap-4 justify-center pt-4">
                <CreateListingGateButton
                  href="/dashboard/listings/new"
                  size="lg"
                  className={cn(
                    'min-h-[56px] min-w-[220px] text-lg font-semibold',
                    'bg-primary text-primary-foreground',
                    'hover:bg-primary/90',
                    'shadow-lg hover:shadow-xl hover:shadow-primary/30',
                    'transition-all duration-300'
                  )}
                >
                  <Upload className="h-5 w-5" />
                  Create listing
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
                    <Search className="h-5 w-5" />
                    Browse Listings
                  </Link>
                </Button>
              </div>
            </CardContent>
          </Card>
        </motion.div>
      </section>

      {/* Mobile bottom nav from root layout (MobileBottomNavWhenSignedIn) when signed in */}
    </div>
  );
}
