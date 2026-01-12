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
import { BottomNav } from '@/components/navigation/BottomNav';

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
      description: 'Add photos, genetics/notes, location, and sale type.',
      icon: Upload,
      gradient: 'from-primary to-primary/90',
      features: ['Add photos', 'Genetics and notes', 'Location details', 'Sale type selection'],
    },
    {
      number: 2,
      title: 'Buyers inquire or bid',
      description: 'Auctions and fixed-price listings, all in one place.',
      icon: Gavel,
      gradient: 'from-primary to-primary/90',
      features: ['Real-time bidding', 'Fixed price option', 'Buyer inquiries', 'Clear communication'],
    },
    {
      number: 3,
      title: 'Close with confidence',
      description: 'Clear terms, clear communication, clear paper trail.',
      icon: CheckCircle2,
      gradient: 'from-primary to-primary/90',
      features: ['Clear terms', 'Documentation', 'Secure payments', 'Paper trail'],
    },
    {
      number: 4,
      title: 'Verification & transport (coming soon)',
      description: 'Optional verification and coordinated transport for qualified listings.',
      icon: Shield,
      gradient: 'from-secondary to-secondary/90',
      features: ['Optional verification', 'Transport coordination (coming soon)', 'Insurance options (coming soon)', 'Trusted partners'],
    },
  ];

  const features = [
    {
      icon: Shield,
      title: 'Verified Sellers',
      description: 'Optional verification available. Seller identity confirmed and eligible to trade.',
      color: 'text-accent',
      bgColor: 'bg-accent/10',
      borderColor: 'border-accent/20',
    },
    {
      icon: Upload,
      title: 'Clear Listings',
      description: 'Include photos, genetics, registration, health notes, and pickup terms.',
      color: 'text-primary',
      bgColor: 'bg-primary/10',
      borderColor: 'border-primary/20',
    },
    {
      icon: MessageCircle,
      title: 'Direct Communication',
      description: 'Contact sellers directly. Ask questions before purchase.',
      color: 'text-secondary',
      bgColor: 'bg-secondary/10',
      borderColor: 'border-secondary/20',
    },
    {
      icon: FileText,
      title: 'Complete Documentation',
      description: 'Paperwork, certificates, and health records included with listings.',
      color: 'text-accent',
      bgColor: 'bg-accent/10',
      borderColor: 'border-accent/20',
    },
    {
      icon: Truck,
      title: 'Transport Planning',
      description: 'Coordinate transport with sellers. Plan pickup and delivery in advance.',
      color: 'text-secondary',
      bgColor: 'bg-secondary/10',
      borderColor: 'border-secondary/20',
    },
    {
      icon: CreditCard,
      title: 'Secure Transactions',
      description: 'Clear payment terms. Optional escrow for qualified transactions.',
      color: 'text-primary',
      bgColor: 'bg-primary/10',
      borderColor: 'border-primary/20',
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
                How Wildlife Exchange works
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

            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.6, delay: 0.8 }}
              className="flex flex-col sm:flex-row gap-4 justify-center pt-6"
            >
              <Button 
                asChild 
                size="lg"
                className={cn(
                  'min-h-[56px] min-w-[220px] text-lg font-semibold',
                  'bg-accent text-accent-foreground',
                  'hover:bg-primary/90',
                  'shadow-lg shadow-primary/20 hover:shadow-xl hover:shadow-primary/30',
                  'transition-all duration-300'
                )}
              >
                <Link href="/dashboard/listings/new" className="flex items-center gap-2">
                  <Upload className="h-5 w-5" />
                  List Your Item
                </Link>
              </Button>
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
                            step.gradient === 'from-secondary to-secondary/90' && 'bg-gradient-to-br from-secondary/5 via-transparent to-secondary/5',
                            step.gradient === 'from-accent to-accent/90' && 'bg-gradient-to-br from-accent/5 via-transparent to-accent/5',
                            step.gradient === 'from-primary to-primary/90' && 'bg-card/50',
                            step.gradient === 'from-secondary to-secondary/90' && 'bg-gradient-to-br from-secondary/5 via-transparent to-secondary/5'
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
                            step.gradient === 'from-secondary to-secondary/90' && 'bg-gradient-to-br from-secondary to-secondary/90',
                            step.gradient === 'from-accent to-accent/90' && 'bg-gradient-to-br from-accent to-accent/90',
                            step.gradient === 'from-primary to-primary/90' && 'bg-primary text-primary-foreground',
                            step.gradient === 'from-secondary to-secondary/90' && 'bg-gradient-to-br from-secondary to-secondary/90'
                          )}>
                            <div className="absolute -top-3 -right-3 w-12 h-12 rounded-full bg-background border-4 border-primary/20 flex items-center justify-center shadow-lg">
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
                                className="flex items-center gap-2 p-3 rounded-lg bg-accent/12 border border-accent/25 hover:border-accent/40 transition-colors"
                              >
                                <CheckCircle2 className="h-4 w-4 text-ring flex-shrink-0" />
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
                Reach serious buyers across Texas.
              </p>
              <div className="flex flex-col sm:flex-row gap-4 justify-center pt-4">
                <Button 
                  asChild 
                  size="lg"
                  className={cn(
                    'min-h-[56px] min-w-[220px] text-lg font-semibold',
                    'bg-primary text-primary-foreground',
                    'hover:bg-primary/90',
                    'shadow-lg hover:shadow-xl hover:shadow-primary/30',
                    'transition-all duration-300'
                  )}
                >
                  <Link href="/dashboard/listings/new" className="flex items-center justify-center gap-2">
                    <Upload className="h-5 w-5" />
                    Create a Listing
                  </Link>
                </Button>
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

      {/* Mobile Bottom Navigation */}
      <BottomNav />
    </div>
  );
}
