import React from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '../../components/ui/card';
import { Label } from '../../components/ui/label';
import { Input } from '../../components/ui/input';
import { Button } from '../../components/ui/button';
import { Separator } from '../../components/ui/separator';
import MaterialIcon from '../../components/ui/MaterialIcon';

const InfoPanel: React.FC = () => {
    return (
        <div className="p-4 space-y-4 h-full overflow-y-auto">
            <div className="flex items-center gap-2 mb-4">
                <MaterialIcon icon="business_center" size={20} className="text-primary" />
                <h2 className="font-semibold text-lg">Case Information</h2>
            </div>

            <Card className="bg-background/40 backdrop-blur-sm border-white/10">
                <CardHeader className="pb-2">
                    <CardTitle className="text-sm font-medium flex items-center gap-2">
                        <MaterialIcon icon="person" size={16} /> Client Details
                    </CardTitle>
                </CardHeader>
                <CardContent className="space-y-3">
                    <div className="space-y-1">
                        <Label htmlFor="client-name" className="text-xs text-muted-foreground">Client Name</Label>
                        <Input id="client-name" placeholder="John Doe" className="h-8 bg-background/50" />
                    </div>
                    <div className="space-y-1">
                        <Label htmlFor="case-no" className="text-xs text-muted-foreground">Case Number</Label>
                        <Input id="case-no" placeholder="2024/123" className="h-8 bg-background/50" />
                    </div>
                </CardContent>
            </Card>

            <Card className="bg-background/40 backdrop-blur-sm border-white/10">
                <CardHeader className="pb-2">
                    <CardTitle className="text-sm font-medium flex items-center gap-2">
                        <MaterialIcon icon="balance" size={16} /> Legal Context
                    </CardTitle>
                </CardHeader>
                <CardContent className="space-y-3">
                    <div className="space-y-1">
                        <Label htmlFor="court" className="text-xs text-muted-foreground">Court</Label>
                        <Input id="court" placeholder="Supreme Court" className="h-8 bg-background/50" />
                    </div>
                    <div className="space-y-1">
                        <Label htmlFor="judge" className="text-xs text-muted-foreground">Judge</Label>
                        <Input id="judge" placeholder="Hon. Justice Smith" className="h-8 bg-background/50" />
                    </div>
                </CardContent>
            </Card>

            <Separator className="my-2" />

            <Button className="w-full" variant="secondary">
                Save Information
            </Button>
        </div>
    );
};

export default InfoPanel;
